import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getValidAccessTokenForUser } from "../_shared/googleDriveToken.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { findInvalidUUID, isValidGoogleDriveId } from "../_shared/validation.ts";
import {
  listFilesInFolder,
  deleteFile,
  createDriveFolder,
  moveToParent,
} from "../_shared/googleDriveHelpers.ts";
import { downloadFile } from "../_shared/storageHelpers.ts";
import { updateExportProgress } from "../_shared/progressTracking.ts";

interface ExportToDriveRequest {
  documentKitId: string;
  workspaceId: string;
  exportFolderId: string;
  session_id?: string; // ID сессии для отслеживания прогресса
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // Validate authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRole = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const userToken = authHeader.slice(7);
    const { data: { user }, error: userError } = await supabaseServiceRole.auth.getUser(userToken);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const { documentKitId, workspaceId, exportFolderId, session_id }: ExportToDriveRequest = await req.json();

    if (!documentKitId || !workspaceId || !exportFolderId) {
      return new Response(
        JSON.stringify({ error: "documentKitId, workspaceId, and exportFolderId are required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const invalidField = findInvalidUUID(
      { documentKitId, workspaceId },
      ["documentKitId", "workspaceId"]
    );
    if (invalidField) {
      return new Response(
        JSON.stringify({ error: `${invalidField} must be a valid UUID` }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!isValidGoogleDriveId(exportFolderId)) {
      return new Response(
        JSON.stringify({ error: "Invalid exportFolderId format" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Проверка принадлежности к workspace (Z8-04)
    const isMember = await checkWorkspaceMembership(supabaseServiceRole, user.id, workspaceId);
    if (!isMember) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Get valid Google Drive access token (auto-refreshes if needed)
    const accessToken = await getValidAccessTokenForUser(supabaseServiceRole, user.id);

    // Get all documents from the kit with their files
    const { data: documents, error: docsError } = await supabaseServiceRole
      .from("documents")
      .select(`
        id,
        name,
        folder_id,
        document_files!inner (
          id,
          file_name,
          file_path,
          file_size,
          mime_type,
          is_current,
          file_id
        )
      `)
      .eq("document_kit_id", documentKitId)
      .eq("is_deleted", false)
      .eq("document_files.is_current", true);

    if (docsError) {
      console.error("Failed to fetch documents:", docsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch documents" }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Get folders to create folder structure
    const { data: folders, error: foldersError } = await supabaseServiceRole
      .from("folders")
      .select("id, name, sort_order")
      .eq("document_kit_id", documentKitId)
      .order("sort_order", { ascending: true, nullsLast: true })
      .order("created_at", { ascending: true });

    if (foldersError) {
      console.error("Failed to fetch folders:", foldersError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch folders" }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // STEP 1: Create temp staging folder inside destination
    console.log("Creating temp staging folder...");
    const tempFolderId = await createDriveFolder(
      `_export_staging_${Date.now()}`,
      exportFolderId,
      accessToken,
    );

    // STEP 2: Create folder structure inside temp folder
    const folderMap = new Map<string, string>(); // folder_id -> google_drive_folder_id
    let createdFoldersCount = 0;

    for (let i = 0; i < (folders || []).length; i++) {
      const folder = folders[i];
      const folderName = `${i + 1}. ${folder.name}`;

      try {
        console.log(`Creating folder: "${folderName}"`);
        const driveFolderId = await createDriveFolder(folderName, tempFolderId, accessToken);
        folderMap.set(folder.id, driveFolderId);
        createdFoldersCount++;
      } catch (err) {
        console.error(`Failed to create folder ${folderName}:`, err);
      }
    }

    const LOG = "[EXPORT-TO-DRIVE]";

    // STEP 3: Upload documents
    let uploadedCount = 0;

    for (const doc of documents || []) {
      try {
        // Обновляем статус: начинаем загрузку
        await updateExportProgress(supabaseServiceRole, session_id, doc.id, 'uploading', undefined, LOG);

        const file = doc.document_files[0];
        if (!file) continue;

        // Download file from Supabase Storage
        let fileData: Blob;
        try {
          fileData = await downloadFile(supabaseServiceRole, file.file_path, file.file_id);
        } catch (dlErr) {
          console.error(`Failed to download file ${file.file_path}:`, dlErr);
          const errMsg = dlErr instanceof Error ? dlErr.message : "Download failed";
          await updateExportProgress(supabaseServiceRole, session_id, doc.id, 'error', errMsg, LOG);
          continue;
        }

        // Determine target folder (inside temp staging folder)
        const targetFolderId = doc.folder_id && folderMap.has(doc.folder_id)
          ? folderMap.get(doc.folder_id)!
          : tempFolderId;

        // Upload to Google Drive with document name (renamed name, not original file name)
        console.log(`Uploading file: "${doc.name}"`);
        const metadata = {
          name: doc.name,
          parents: [targetFolderId],
        };

        const formData = new FormData();
        formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
        formData.append("file", fileData);

        const uploadResponse = await fetch(
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` },
            body: formData,
          }
        );

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error(`Failed to upload file ${file.file_name}:`, errorText);
          await updateExportProgress(supabaseServiceRole, session_id, doc.id, 'error', `Failed to upload: ${errorText}`, LOG);
          continue;
        }

        // Обновляем статус: успешно загружено
        await updateExportProgress(supabaseServiceRole, session_id, doc.id, 'success', undefined, LOG);
        uploadedCount++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        console.error(`Error exporting document ${doc.id}:`, error);
        await updateExportProgress(supabaseServiceRole, session_id, doc.id, 'error', errorMsg, LOG);
      }
    }

    // STEP 4: Swap — delete old files, move new from staging to destination root
    console.log("Swapping: removing old files and moving new ones...");
    const existingFiles = await listFilesInFolder(exportFolderId, accessToken);
    // Delete everything except the staging folder
    let deletedCount = 0;
    for (const file of existingFiles) {
      if (file.id === tempFolderId) continue;
      const deleted = await deleteFile(file.id, accessToken);
      if (deleted) deletedCount++;
    }
    console.log(`Deleted ${deletedCount} old items`);

    // Move all items from staging folder into destination root
    const stagedItems = await listFilesInFolder(tempFolderId, accessToken);
    let movedCount = 0;
    for (const item of stagedItems) {
      try {
        await moveToParent(item.id, tempFolderId, exportFolderId, accessToken);
        movedCount++;
      } catch (moveErr) {
        console.error(`Failed to move item ${item.id} from staging:`, moveErr);
      }
    }
    // Delete staging folder only if all items were moved
    if (movedCount === stagedItems.length) {
      await deleteFile(tempFolderId, accessToken);
      console.log(`Moved ${movedCount} items to destination, staging folder removed`);
    } else {
      console.warn(`Moved ${movedCount}/${stagedItems.length} items. Staging folder kept for manual cleanup.`);
    }

    const totalCreated = createdFoldersCount + uploadedCount;

    return new Response(
      JSON.stringify({
        success: true,
        deleted: deletedCount,
        created: totalCreated,
        folders: createdFoldersCount,
        files: uploadedCount,
        message: `Sync complete: cleared ${deletedCount} items, created ${createdFoldersCount} folders and uploaded ${uploadedCount} files`,
      }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Export error:", error);
    return new Response(
      JSON.stringify({ error: "Export failed" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
