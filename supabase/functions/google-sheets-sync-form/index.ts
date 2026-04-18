/**
 * Edge Function: google-sheets-sync-form
 *
 * Синхронизирует данные FormKit → Google Sheets.
 * Создаёт или обновляет таблицу, записывает данные и применяет форматирование.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { findInvalidUUID } from "../_shared/validation.ts";
import { getValidAccessTokenForUser } from "../_shared/googleDriveToken.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";

import {
  extractFolderIdFromLink,
  createOrGetSpreadsheet,
  getSheetId,
  writeData,
  updateSpreadsheetTitle,
} from "./googleSheetsApi.ts";
import { buildSpreadsheetData } from "./spreadsheetData.ts";
import { applyBasicFormatting } from "./spreadsheetFormatting.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: getCorsHeaders(req),
    });
  }

  try {
    if (!Deno.env.get("GOOGLE_CLIENT_ID") || !Deno.env.get("GOOGLE_CLIENT_SECRET")) {
      throw new Error("Google Client ID or Secret not configured");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization") ?? "" },
        },
      },
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const requestBody = await req.json();
    const { formKitId, projectId } = requestBody;

    if (!formKitId || !projectId) {
      return new Response(JSON.stringify({ error: "formKitId and projectId are required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const invalidField = findInvalidUUID({ formKitId, projectId }, ["formKitId", "projectId"]);
    if (invalidField) {
      return new Response(JSON.stringify({ error: `${invalidField} must be a valid UUID` }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ---------- Data fetching ----------

    const { data: project, error: projectError } = await supabaseClient
      .from("projects")
      .select("id, name, google_drive_folder_link, workspace_id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      throw new Error("Project not found");
    }

    // Z8-04: verify workspace membership
    const isMember = await checkWorkspaceMembership(supabaseAdmin, user.id, project.workspace_id);
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const parentFolderId = extractFolderIdFromLink(project.google_drive_folder_link);
    if (!parentFolderId) {
      throw new Error(
        "Project folder not configured. Please set Google Drive folder link in project settings.",
      );
    }

    const { data: formKit, error: formKitError } = await supabaseClient
      .from("form_kits")
      .select("id, name, google_sheet_id")
      .eq("id", formKitId)
      .single();

    if (formKitError || !formKit) {
      throw new Error("Form kit not found");
    }

    // Z8-25: use supabaseAdmin (service role) — RLS blocks user client from reading google_drive_tokens
    const accessToken = await getValidAccessTokenForUser(supabaseAdmin, user.id);

    const { data: fieldValues, error: valuesError } = await supabaseClient
      .from("form_kit_field_values")
      .select("field_definition_id, composite_field_id, value")
      .eq("form_kit_id", formKitId);

    if (valuesError) throw valuesError;

    const formData: Record<string, string> = {};
    fieldValues?.forEach((record) => {
      if (record.composite_field_id) {
        formData[`${record.composite_field_id}:${record.field_definition_id}`] = record.value || "";
      } else {
        formData[record.field_definition_id] = record.value || "";
      }
    });

    const { data: fields, error: fieldsError } = await supabaseClient
      .from("form_kit_fields")
      .select("*")
      .eq("form_kit_id", formKitId)
      .order("sort_order");

    if (fieldsError) throw fieldsError;

    const { data: sections, error: sectionsError } = await supabaseClient
      .from("form_kit_sections")
      .select("*")
      .eq("form_kit_id", formKitId)
      .order("sort_order");

    if (sectionsError) throw sectionsError;

    // Fetch composite items
    const compositeFieldDefinitionIds =
      fields?.filter((f) => f.field_type === "composite").map((f) => f.field_definition_id) || [];

    let compositeItems: Array<{
      composite_field_id: string;
      nested_field_definition_id: string;
      nested_field: { name: string } | null;
      is_required?: boolean;
      sort_order?: number;
    }> = [];

    if (compositeFieldDefinitionIds.length > 0) {
      const { data: items, error: compositeError } = await supabaseClient
        .from("field_definition_composite_items")
        .select(
          `
          id,
          composite_field_id,
          nested_field_id,
          order_index,
          field_definitions!field_definition_composite_items_nested_field_id_fkey (
            id,
            name,
            field_type
          )
        `,
        )
        .in("composite_field_id", compositeFieldDefinitionIds)
        .order("order_index");

      if (!compositeError && items) {
        compositeItems = items.map((item: Record<string, unknown>) => ({
          composite_field_id: item.composite_field_id as string,
          nested_field_definition_id: item.nested_field_id as string,
          nested_field: Array.isArray(item.field_definitions)
            ? (item.field_definitions[0] as { name: string } | null)
            : (item.field_definitions as { name: string } | null),
          sort_order: item.order_index as number | undefined,
        }));
      }
    }

    // ---------- Build & write spreadsheet ----------

    const spreadsheetData = buildSpreadsheetData(
      fields || [],
      sections || [],
      formData,
      compositeItems,
    );

    const spreadsheetName = `${formKit.name} + ${project.name}`;

    const { spreadsheetId, isNew } = await createOrGetSpreadsheet(
      accessToken,
      spreadsheetName,
      parentFolderId,
      formKit.google_sheet_id,
    );

    if (!isNew) {
      await updateSpreadsheetTitle(accessToken, spreadsheetId, spreadsheetName);
    }

    await writeData(accessToken, spreadsheetId, spreadsheetData);

    const sheetId = await getSheetId(accessToken, spreadsheetId);
    if (sheetId !== null) {
      await applyBasicFormatting(accessToken, spreadsheetId, sheetId, spreadsheetData);
    }

    await supabaseClient
      .from("form_kits")
      .update({ google_sheet_id: spreadsheetId })
      .eq("id", formKitId);

    return new Response(
      JSON.stringify({
        success: true,
        spreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      }),
      {
        status: 200,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error syncing form to Google Sheets:", error);

    return new Response(
      JSON.stringify({ error: "Failed to sync form to Google Sheets" }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      },
    );
  }
});