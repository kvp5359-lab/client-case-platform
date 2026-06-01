import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/edge.ts";
import {
  safeErrorResponse,
  checkWorkspaceMembership,
} from "../_shared/safeErrorResponse.ts";
import { findMissingField, findInvalidUUID } from "../_shared/validation.ts";
import Docxtemplater from "npm:docxtemplater@3";
import PizZip from "npm:pizzip@3";

interface Placeholder {
  name: string;
  field_definition_id: string | null;
  source_directory_id?: string | null;
  directory_field_id?: string | null;
}

/**
 * Резолвит значение колонки записи справочника (или display_name).
 * Возвращает карту: ключ `${entry_id}:${field_id|'__display__'}` → текст.
 */
// deno-lint-ignore no-explicit-any
async function resolveDirectoryEntries(
  client: any,
  lookups: { entryId: string; fieldId: string | null }[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (lookups.length === 0) return out;

  const displayEntryIds = new Set<string>();
  const colEntryIds = new Set<string>();
  const colFieldIds = new Set<string>();
  for (const l of lookups) {
    if (l.fieldId) {
      colEntryIds.add(l.entryId);
      colFieldIds.add(l.fieldId);
    } else {
      displayEntryIds.add(l.entryId);
    }
  }

  if (displayEntryIds.size > 0) {
    const { data } = await client
      .from("custom_directory_entries")
      .select("id, display_name")
      .in("id", Array.from(displayEntryIds));
    for (const e of data || []) {
      out[`${e.id}:__display__`] = e.display_name ?? "";
    }
  }

  if (colEntryIds.size > 0 && colFieldIds.size > 0) {
    const { data } = await client
      .from("custom_directory_values")
      .select(
        "entry_id, field_id, value_text, value_number, value_date, value_bool, value_json",
      )
      .in("entry_id", Array.from(colEntryIds))
      .in("field_id", Array.from(colFieldIds));
    for (const v of data || []) {
      const raw =
        v.value_text ??
        (v.value_number !== null && v.value_number !== undefined
          ? String(v.value_number)
          : null) ??
        v.value_date ??
        (v.value_bool !== null && v.value_bool !== undefined
          ? v.value_bool
            ? "Да"
            : "Нет"
          : null) ??
        (v.value_json !== null && v.value_json !== undefined
          ? Array.isArray(v.value_json)
            ? v.value_json.join(", ")
            : String(v.value_json).replace(/^"|"$/g, "")
          : null);
      if (raw !== null && raw !== undefined) {
        out[`${v.entry_id}:${v.field_id}`] = String(raw);
      }
    }
  }

  return out;
}

/**
 * generate-document — заполняет DOCX-шаблон данными и конвертирует в PDF.
 *
 * POST body: { document_template_id, project_id, workspace_id, custom_values?, convert_to_pdf? }
 * Response:  { success, file_base64, file_name, mime_type }
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return safeErrorResponse(req, corsHeadersFor, {
        status: 401,
        publicMessage: "Missing authorization header",
      });
    }

    const body = await req.json();

    // Validate required fields
    const missing = findMissingField(body, [
      "document_template_id",
      "project_id",
      "workspace_id",
    ]);
    if (missing) {
      return safeErrorResponse(req, corsHeadersFor, {
        status: 400,
        publicMessage: `Missing required field: ${missing}`,
      });
    }

    const invalidUUID = findInvalidUUID(body, [
      "document_template_id",
      "project_id",
      "workspace_id",
    ]);
    if (invalidUUID) {
      return safeErrorResponse(req, corsHeadersFor, {
        status: 400,
        publicMessage: `Invalid UUID: ${invalidUUID}`,
      });
    }

    const {
      document_template_id,
      project_id,
      workspace_id,
      custom_values,
      convert_to_pdf,
    } = body;

    // Clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseUser = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify user + workspace
    const {
      data: { user },
    } = await supabaseUser.auth.getUser();
    if (!user) {
      return safeErrorResponse(req, corsHeadersFor, {
        status: 401,
        publicMessage: "Unauthorized",
      });
    }

    const isMember = await checkWorkspaceMembership(
      supabaseAdmin,
      user.id,
      workspace_id,
    );
    if (!isMember) {
      return safeErrorResponse(req, corsHeadersFor, {
        status: 403,
        publicMessage: "Access denied",
      });
    }

    // 1. Load document template
    const { data: template, error: templateError } = await supabaseUser
      .from("document_templates")
      .select("*")
      .eq("id", document_template_id)
      .single();

    if (templateError || !template) {
      return safeErrorResponse(req, corsHeadersFor, {
        status: 404,
        publicMessage: "Template not found",
        internalError: templateError,
        logPrefix: "[GENERATE-DOC]",
      });
    }

    // 2. Download DOCX template from Storage
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from("document-templates")
      .download(template.file_path);

    if (downloadError || !fileData) {
      return safeErrorResponse(req, corsHeadersFor, {
        status: 500,
        publicMessage: "Failed to download template file",
        internalError: downloadError,
        logPrefix: "[GENERATE-DOC]",
      });
    }

    // 3-5. Build placeholder → value map
    let fillData: Record<string, string>;

    if (
      custom_values &&
      typeof custom_values === "object" &&
      !Array.isArray(custom_values)
    ) {
      // Custom values passed directly (from document_generations).
      fillData = { ...(custom_values as Record<string, string>) };

      // Плейсхолдеры с прямой привязкой к справочнику: в custom_values
      // хранится id записи (entry_id) — резолвим в значение колонки.
      const placeholders = (template.placeholders || []) as Placeholder[];
      const lookups: { entryId: string; fieldId: string | null }[] = [];
      for (const ph of placeholders) {
        if (!ph.source_directory_id) continue;
        const entryId = fillData[ph.name];
        if (entryId) {
          lookups.push({ entryId, fieldId: ph.directory_field_id ?? null });
        }
      }

      if (lookups.length > 0) {
        const resolved = await resolveDirectoryEntries(supabaseUser, lookups);
        for (const ph of placeholders) {
          if (!ph.source_directory_id) continue;
          const entryId = fillData[ph.name];
          if (!entryId) continue;
          const key = `${entryId}:${ph.directory_field_id ?? "__display__"}`;
          fillData[ph.name] = resolved[key] ?? "";
        }
      }
    } else {
      // Load from form_kit_field_values (legacy behavior)
      const { data: formKits } = await supabaseUser
        .from("form_kits")
        .select("id")
        .eq("project_id", project_id);

      const formKitIds = (formKits || []).map(
        (fk: { id: string }) => fk.id,
      );

      const dataMap: Record<string, string> = {};

      if (formKitIds.length > 0) {
        const { data: allValues } = await supabaseUser
          .from("form_kit_field_values")
          .select(
            "field_definition_id, composite_field_id, value, updated_at",
          )
          .in("form_kit_id", formKitIds)
          .order("updated_at", { ascending: false });

        const seen = new Set<string>();
        for (const fv of allValues || []) {
          if (!seen.has(fv.field_definition_id) && fv.value) {
            seen.add(fv.field_definition_id);
            dataMap[fv.field_definition_id] = fv.value;
          }
        }
      }

      const placeholders = (template.placeholders || []) as Placeholder[];

      // Определить, какие из привязанных полей — directory_ref (Справочник).
      // У такого поля значение в form_kit_field_values — это UUID записи
      // справочника (custom_directory_entries.id), которую нужно резолвить
      // в читаемое значение перед подстановкой.
      const mappedFieldIds = Array.from(
        new Set(
          placeholders
            .map((ph) => ph.field_definition_id)
            .filter((id): id is string => !!id),
        ),
      );

      // fieldId → ref_directory_id (только для directory_ref полей)
      const dirRefByField: Record<string, string> = {};
      if (mappedFieldIds.length > 0) {
        const { data: fieldDefs } = await supabaseUser
          .from("field_definitions")
          .select("id, field_type, options")
          .in("id", mappedFieldIds);

        for (const fd of fieldDefs || []) {
          if (fd.field_type === "directory_ref") {
            const refId = (fd.options as { ref_directory_id?: string } | null)
              ?.ref_directory_id;
            if (refId) dirRefByField[fd.id] = refId;
          }
        }
      }

      // Собрать entry_id'шники, которые нужно резолвить, и провести батч-запросы.
      // Карта: entry_id → display_name, и (entry_id + field_id) → значение колонки.
      const entryDisplayName: Record<string, string> = {};
      const columnValue: Record<string, string> = {}; // ключ `${entry_id}:${field_id}`

      const entryIdsForDisplay = new Set<string>();
      const columnLookups: { entryId: string; fieldId: string }[] = [];

      for (const ph of placeholders) {
        const fid = ph.field_definition_id;
        if (!fid || !dirRefByField[fid]) continue;
        const entryId = dataMap[fid];
        if (!entryId) continue;
        if (ph.directory_field_id) {
          columnLookups.push({ entryId, fieldId: ph.directory_field_id });
        } else {
          entryIdsForDisplay.add(entryId);
        }
      }

      if (entryIdsForDisplay.size > 0) {
        const { data: entries } = await supabaseUser
          .from("custom_directory_entries")
          .select("id, display_name")
          .in("id", Array.from(entryIdsForDisplay));
        for (const e of entries || []) {
          entryDisplayName[e.id] = e.display_name ?? "";
        }
      }

      if (columnLookups.length > 0) {
        const entryIds = Array.from(new Set(columnLookups.map((c) => c.entryId)));
        const fieldIds = Array.from(new Set(columnLookups.map((c) => c.fieldId)));
        const { data: vals } = await supabaseUser
          .from("custom_directory_values")
          .select(
            "entry_id, field_id, value_text, value_number, value_date, value_bool, value_json",
          )
          .in("entry_id", entryIds)
          .in("field_id", fieldIds);
        for (const v of vals || []) {
          const raw =
            v.value_text ??
            (v.value_number !== null && v.value_number !== undefined
              ? String(v.value_number)
              : null) ??
            v.value_date ??
            (v.value_bool !== null && v.value_bool !== undefined
              ? v.value_bool
                ? "Да"
                : "Нет"
              : null) ??
            (v.value_json !== null && v.value_json !== undefined
              ? Array.isArray(v.value_json)
                ? v.value_json.join(", ")
                : String(v.value_json).replace(/^"|"$/g, "")
              : null);
          if (raw !== null && raw !== undefined) {
            columnValue[`${v.entry_id}:${v.field_id}`] = String(raw);
          }
        }
      }

      fillData = {};

      for (const ph of placeholders) {
        const fid = ph.field_definition_id;
        if (!fid || !dataMap[fid]) {
          fillData[ph.name] = "";
          continue;
        }

        // directory_ref: резолвим UUID записи в читаемое значение
        if (dirRefByField[fid]) {
          const entryId = dataMap[fid];
          fillData[ph.name] = ph.directory_field_id
            ? (columnValue[`${entryId}:${ph.directory_field_id}`] ?? "")
            : (entryDisplayName[entryId] ?? "");
          continue;
        }

        // Обычное поле
        let value = dataMap[fid];
        try {
          const parsed = JSON.parse(value);
          if (typeof parsed === "string") {
            value = parsed;
          } else if (Array.isArray(parsed)) {
            value = parsed.join(", ");
          }
        } catch {
          // Not JSON, use as-is
        }
        fillData[ph.name] = value;
      }
    }

    // 6. Fill DOCX template
    const buffer = await fileData.arrayBuffer();
    const zip = new PizZip(buffer);
    const doc = new Docxtemplater(zip, {
      delimiters: { start: "{{", end: "}}" },
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => "",
    });

    doc.render(fillData);

    const outputBuffer: Uint8Array = doc.getZip().generate({
      type: "uint8array",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    // 7. Convert to PDF via Gotenberg (if requested) or return DOCX
    let finalBuffer: Uint8Array = outputBuffer;
    let mimeType =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    let outputFileName = template.file_name.replace(
      /\.docx$/i,
      "_filled.docx",
    );

    if (convert_to_pdf) {
      const gotenbergUrl = Deno.env.get("GOTENBERG_URL");
      const gotenbergToken = Deno.env.get("GOTENBERG_TOKEN");

      if (!gotenbergUrl || !gotenbergToken) {
        return safeErrorResponse(req, corsHeadersFor, {
          status: 500,
          publicMessage: "PDF conversion is not configured",
          logPrefix: "[GENERATE-DOC]",
        });
      }

      const formData = new FormData();
      formData.append(
        "files",
        new Blob([outputBuffer], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
        "document.docx",
      );

      const gotenbergResponse = await fetch(
        `${gotenbergUrl}/forms/libreoffice/convert`,
        {
          method: "POST",
          headers: {
            "X-Gotenberg-Token": gotenbergToken,
          },
          body: formData,
        },
      );

      if (!gotenbergResponse.ok) {
        const errorText = await gotenbergResponse.text().catch(() => "");
        console.error(
          `[GENERATE-DOC] Gotenberg error: ${gotenbergResponse.status} ${errorText}`,
        );
        return safeErrorResponse(req, corsHeadersFor, {
          status: 500,
          publicMessage: "Failed to convert document to PDF",
          logPrefix: "[GENERATE-DOC]",
        });
      }

      const pdfArrayBuffer = await gotenbergResponse.arrayBuffer();
      finalBuffer = new Uint8Array(pdfArrayBuffer);
      mimeType = "application/pdf";
      outputFileName = template.file_name.replace(/\.docx$/i, "_filled.pdf");
    }

    // Encode to base64 (B-90: use apply with chunks to avoid stack overflow)
    const CHUNK_SIZE = 4096;
    const chunks: string[] = [];
    for (let i = 0; i < finalBuffer.length; i += CHUNK_SIZE) {
      const chunk = finalBuffer.subarray(
        i,
        Math.min(i + CHUNK_SIZE, finalBuffer.length),
      );
      chunks.push(
        String.fromCharCode.apply(null, chunk as unknown as number[]),
      );
    }
    const base64 = btoa(chunks.join(""));

    return new Response(
      JSON.stringify({
        success: true,
        file_base64: base64,
        file_name: outputFileName,
        mime_type: mimeType,
      }),
      {
        status: 200,
        headers: {
          ...corsHeadersFor(req),
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    return safeErrorResponse(req, corsHeadersFor, {
      status: 500,
      publicMessage: "Failed to generate document",
      internalError: error,
      logPrefix: "[GENERATE-DOC]",
    });
  }
});
