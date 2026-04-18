import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
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
}

/**
 * generate-document — заполняет DOCX-шаблон данными и конвертирует в PDF.
 *
 * POST body: { document_template_id, project_id, workspace_id, custom_values?, convert_to_pdf? }
 * Response:  { success, file_base64, file_name, mime_type }
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return safeErrorResponse(req, getCorsHeaders, {
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
      return safeErrorResponse(req, getCorsHeaders, {
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
      return safeErrorResponse(req, getCorsHeaders, {
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
      return safeErrorResponse(req, getCorsHeaders, {
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
      return safeErrorResponse(req, getCorsHeaders, {
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
      return safeErrorResponse(req, getCorsHeaders, {
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
      return safeErrorResponse(req, getCorsHeaders, {
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
      // Custom values passed directly (from document_generations)
      fillData = custom_values as Record<string, string>;
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
      fillData = {};

      for (const ph of placeholders) {
        if (ph.field_definition_id && dataMap[ph.field_definition_id]) {
          let value = dataMap[ph.field_definition_id];
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
        } else {
          fillData[ph.name] = "";
        }
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
        return safeErrorResponse(req, getCorsHeaders, {
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
        return safeErrorResponse(req, getCorsHeaders, {
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
          ...getCorsHeaders(req),
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    return safeErrorResponse(req, getCorsHeaders, {
      status: 500,
      publicMessage: "Failed to generate document",
      internalError: error,
      logPrefix: "[GENERATE-DOC]",
    });
  }
});
