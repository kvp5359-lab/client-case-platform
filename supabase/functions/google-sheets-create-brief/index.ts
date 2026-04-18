/**
 * Edge Function: google-sheets-create-brief
 *
 * Creates a brief from a Google Sheets template:
 * 1. Copies the template spreadsheet
 * 2. Moves the copy to the project's Google Drive folder
 * 3. Renames it to the provided name
 * 4. Shares with all project participants (by email, role: writer)
 * 5. Saves the spreadsheet ID to form_kits.brief_sheet_id
 *
 * Also supports:
 * - action: "share" — share an existing brief with a specific email
 * - action: "disconnect" — remove brief_sheet_id from form_kit (does NOT delete the spreadsheet)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getValidAccessTokenForUser } from "../_shared/googleDriveToken.ts";
import { isValidUUID, isValidGoogleDriveId } from "../_shared/validation.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";

const LOG_PREFIX = "[google-sheets-create-brief]";

/** Copy a Google Sheets file. Returns the new file's ID. */
async function copySpreadsheet(
  templateId: string,
  name: string,
  accessToken: string,
): Promise<string> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${templateId}/copy?supportsAllDrives=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`${LOG_PREFIX} Failed to copy template:`, errorText);
    throw new Error("Failed to copy template spreadsheet");
  }

  const data = await response.json();
  return data.id;
}

/** Move a file to a different folder. */
async function moveFileToFolder(
  fileId: string,
  folderId: string,
  accessToken: string,
): Promise<void> {
  // First, get current parents
  const getResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!getResponse.ok) {
    console.error(`${LOG_PREFIX} Failed to get file parents`);
    return; // Non-critical — file was still created
  }

  const fileData = await getResponse.json();
  const currentParents = (fileData.parents || []).join(",");

  // Move to new folder
  const moveResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${folderId}&removeParents=${currentParents}&supportsAllDrives=true`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!moveResponse.ok) {
    const errorText = await moveResponse.text();
    console.error(`${LOG_PREFIX} Failed to move file:`, errorText);
  }
}

/** Share a file with an email address (role: writer). */
async function shareWithEmail(
  fileId: string,
  email: string,
  accessToken: string,
): Promise<boolean> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: "writer",
        type: "user",
        emailAddress: email,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    // Don't fail the whole operation if sharing with one email fails
    console.error(`${LOG_PREFIX} Failed to share with ${email}:`, errorText);
    return false;
  }

  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const { action, workspaceId } = body;

    // Validate workspaceId
    if (!workspaceId || !isValidUUID(workspaceId)) {
      return new Response(
        JSON.stringify({ error: "workspaceId is required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const isMember = await checkWorkspaceMembership(supabaseAdmin, user.id, workspaceId);
    if (!isMember) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Get Google Drive access token
    const accessToken = await getValidAccessTokenForUser(supabaseAdmin, user.id);

    // =========================================================================
    // ACTION: share — share existing brief with one email
    // =========================================================================
    if (action === "share") {
      const { briefSheetId, email } = body;

      if (!briefSheetId || !isValidGoogleDriveId(briefSheetId)) {
        return new Response(
          JSON.stringify({ error: "Invalid briefSheetId" }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }

      if (!email || typeof email !== "string") {
        return new Response(
          JSON.stringify({ error: "Email is required" }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }

      const shared = await shareWithEmail(briefSheetId, email, accessToken);

      return new Response(
        JSON.stringify({ success: shared }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // =========================================================================
    // ACTION: disconnect — remove brief_sheet_id from form_kit
    // =========================================================================
    if (action === "disconnect") {
      const { formKitId } = body;

      if (!formKitId || !isValidUUID(formKitId)) {
        return new Response(
          JSON.stringify({ error: "Invalid formKitId" }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }

      const { error } = await supabaseAdmin
        .from("form_kits")
        .update({ brief_sheet_id: null })
        .eq("id", formKitId);

      if (error) {
        console.error(`${LOG_PREFIX} Failed to disconnect brief:`, error);
        return new Response(
          JSON.stringify({ error: "Failed to disconnect brief" }),
          { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // =========================================================================
    // DEFAULT ACTION: create — copy template, move, rename, share, save
    // =========================================================================
    const { templateSheetId, formKitId, projectId, briefName, folderId } = body;

    // Validate inputs
    if (!templateSheetId || !isValidGoogleDriveId(templateSheetId)) {
      return new Response(
        JSON.stringify({ error: "Invalid templateSheetId" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    if (!formKitId || !isValidUUID(formKitId)) {
      return new Response(
        JSON.stringify({ error: "Invalid formKitId" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    if (!projectId || !isValidUUID(projectId)) {
      return new Response(
        JSON.stringify({ error: "Invalid projectId" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    if (!briefName || typeof briefName !== "string" || briefName.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "briefName is required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    console.log(`${LOG_PREFIX} Creating brief "${briefName}" from template ${templateSheetId}`);

    // 1. Copy the template
    const newSheetId = await copySpreadsheet(templateSheetId, briefName.trim(), accessToken);
    console.log(`${LOG_PREFIX} Copied template → ${newSheetId}`);

    // 2. Move to project folder (if folderId provided)
    if (folderId && isValidGoogleDriveId(folderId)) {
      await moveFileToFolder(newSheetId, folderId, accessToken);
      console.log(`${LOG_PREFIX} Moved to folder ${folderId}`);
    }

    // 3. Get project participants' emails and share
    const { data: projectParticipants } = await supabaseAdmin
      .from("project_participants")
      .select("participant_id, participants!inner(email)")
      .eq("project_id", projectId);

    let sharedCount = 0;
    if (projectParticipants) {
      const emails = new Set<string>();
      for (const pp of projectParticipants) {
        const participant = pp.participants as unknown as { email: string | null };
        if (participant?.email) {
          emails.add(participant.email);
        }
      }

      // Share with each participant (skip the current user — they're the owner)
      for (const email of emails) {
        if (email === user.email) continue;
        const ok = await shareWithEmail(newSheetId, email, accessToken);
        if (ok) sharedCount++;
      }
      console.log(`${LOG_PREFIX} Shared with ${sharedCount} participants`);
    }

    // 4. Save brief_sheet_id to form_kits
    const { error: updateError } = await supabaseAdmin
      .from("form_kits")
      .update({ brief_sheet_id: newSheetId })
      .eq("id", formKitId);

    if (updateError) {
      console.error(`${LOG_PREFIX} Failed to save brief_sheet_id:`, updateError);
      return new Response(
        JSON.stringify({ error: "Brief created but failed to save reference" }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        briefSheetId: newSheetId,
        sharedWith: sharedCount,
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);

    const message = error instanceof Error && error.message === "Google Drive not connected"
      ? "Google Drive not connected"
      : "Internal server error";

    const status = message === "Google Drive not connected" ? 401 : 500;

    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});