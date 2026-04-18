/**
 * Edge Function: google-drive-create-folder
 *
 * Actions:
 * - default: Create a single folder in Google Drive
 * - "batch": Create a parent folder + multiple subfolders inside it
 * - "list": List subfolders of a given folder (for picker UI)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getValidAccessTokenForUser } from "../_shared/googleDriveToken.ts";
import { createDriveFolder, listFilesInFolder } from "../_shared/googleDriveHelpers.ts";
import { isValidUUID, isValidGoogleDriveId } from "../_shared/validation.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";

const LOG_PREFIX = "[google-drive-create-folder]";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
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

    const accessToken = await getValidAccessTokenForUser(supabaseAdmin, user.id);

    // =========================================================================
    // ACTION: list — list subfolders of a given folder
    // =========================================================================
    if (action === "list") {
      const { folderId } = body;

      if (!folderId || !isValidGoogleDriveId(folderId)) {
        return new Response(
          JSON.stringify({ error: "Invalid folderId" }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }

      const files = await listFilesInFolder(folderId, accessToken);
      const folders = files
        .filter((f) =>
          f.mimeType === "application/vnd.google-apps.folder" ||
          (f.mimeType === "application/vnd.google-apps.shortcut" &&
           f.shortcutDetails?.targetMimeType === "application/vnd.google-apps.folder")
        )
        .map((f) => ({
          id: f.mimeType === "application/vnd.google-apps.shortcut"
            ? f.shortcutDetails!.targetId
            : f.id,
          name: f.name,
        }));

      return new Response(
        JSON.stringify({ folders }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // =========================================================================
    // ACTION: batch — create parent folder (optional) + subfolders
    // =========================================================================
    if (action === "batch") {
      const { parentFolderId, parentFolderName, subfolderNames } = body;

      if (!parentFolderId || !isValidGoogleDriveId(parentFolderId)) {
        return new Response(
          JSON.stringify({ error: "Invalid parentFolderId" }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }

      if (!Array.isArray(subfolderNames) || subfolderNames.length === 0) {
        return new Response(
          JSON.stringify({ error: "subfolderNames must be a non-empty array" }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }

      let targetFolderId = parentFolderId;

      // If parentFolderName is provided, create a parent folder first
      if (parentFolderName && typeof parentFolderName === "string" && parentFolderName.trim()) {
        console.log(`${LOG_PREFIX} Creating parent folder "${parentFolderName}" in ${parentFolderId}`);
        targetFolderId = await createDriveFolder(parentFolderName.trim(), parentFolderId, accessToken);
        console.log(`${LOG_PREFIX} Created parent folder ${targetFolderId}`);
      }

      // Create subfolders sequentially (to respect rate limits)
      const created: Array<{ name: string; id: string }> = [];
      for (const name of subfolderNames) {
        if (typeof name !== "string" || !name.trim()) continue;
        try {
          const id = await createDriveFolder(name.trim(), targetFolderId, accessToken);
          created.push({ name: name.trim(), id });
        } catch (err) {
          console.error(`${LOG_PREFIX} Failed to create subfolder "${name}":`, err);
        }
      }

      console.log(`${LOG_PREFIX} Created ${created.length}/${subfolderNames.length} subfolders`);

      return new Response(
        JSON.stringify({
          success: true,
          targetFolderId,
          targetFolderLink: `https://drive.google.com/drive/folders/${targetFolderId}`,
          created,
        }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // =========================================================================
    // DEFAULT: create a single folder
    // =========================================================================
    const { parentFolderId, folderName } = body;

    if (!parentFolderId || !isValidGoogleDriveId(parentFolderId)) {
      return new Response(
        JSON.stringify({ error: "Invalid parentFolderId" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    if (!folderName || typeof folderName !== "string" || folderName.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "folderName is required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    console.log(`${LOG_PREFIX} Creating folder "${folderName}" in parent ${parentFolderId}`);

    const newFolderId = await createDriveFolder(folderName.trim(), parentFolderId, accessToken);

    console.log(`${LOG_PREFIX} Created folder ${newFolderId}`);

    return new Response(
      JSON.stringify({
        success: true,
        folderId: newFolderId,
        folderLink: `https://drive.google.com/drive/folders/${newFolderId}`,
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
