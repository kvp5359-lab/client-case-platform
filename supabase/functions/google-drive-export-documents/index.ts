import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isValidUUID, isValidGoogleDriveId } from "../_shared/validation.ts";
import { getValidAccessTokenForUser } from "../_shared/googleDriveToken.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { deleteFolderContentsRecursively, createDriveFolder } from "../_shared/googleDriveHelpers.ts";
import { downloadFile } from "../_shared/storageHelpers.ts";
import { updateExportProgress } from "../_shared/progressTracking.ts";

interface ExportRequest {
  folder_id: string;
  sync_mode?: 'replace_all' | 'add_only' | 'replace_existing';
  session_id?: string; // ID сессии для отслеживания прогресса
  workspace_id?: string; // Z8-08: explicit workspace_id for membership check
  documents: Array<{
    document_id: string;
    file_path: string;
    file_name: string;
    mime_type: string;
    folder_name?: string;
    file_id?: string | null;
  }>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
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

    const { folder_id, sync_mode = 'add_only', session_id, workspace_id, documents }: ExportRequest = await req.json();

    if (!folder_id || !documents || documents.length === 0) {
      return new Response(
        JSON.stringify({ error: "folder_id and documents are required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (typeof folder_id !== "string" || !isValidGoogleDriveId(folder_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid folder_id format" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const MAX_DOCUMENTS = 200;
    if (documents.length > MAX_DOCUMENTS) {
      return new Response(
        JSON.stringify({ error: `Too many documents. Maximum ${MAX_DOCUMENTS} allowed per export.` }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (session_id && !isValidUUID(session_id)) {
      return new Response(
        JSON.stringify({ error: "session_id must be a valid UUID" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Z8-10: workspace membership is required
    if (!workspace_id || !isValidUUID(workspace_id)) {
      return new Response(
        JSON.stringify({ error: "workspace_id is required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const isMember = await checkWorkspaceMembership(supabaseServiceRole, user.id, workspace_id);
    if (!isMember) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Get valid Google Drive access token (auto-refreshes if needed)
    const accessToken = await getValidAccessTokenForUser(supabaseServiceRole, user.id);

    // Check access to target folder
    console.log("[EXPORT-DOCUMENTS] Checking access to folder:", folder_id);
    const folderCheckResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folder_id}?fields=id,name,capabilities&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!folderCheckResponse.ok) {
      if (folderCheckResponse.status === 404) {
        return new Response(
          JSON.stringify({ error: "Folder not found" }),
          { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      if (folderCheckResponse.status === 403) {
        return new Response(
          JSON.stringify({ error: "No access to the specified folder" }),
          { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      const errorText = await folderCheckResponse.text();
      console.error("Failed to check folder access:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to check folder access" }),
        { status: folderCheckResponse.status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const folderData = await folderCheckResponse.json();
    if (folderData.capabilities?.canAddChildren !== true) {
      return new Response(
        JSON.stringify({ error: "No write access to the specified folder" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Режим 1: Удалить всё перед загрузкой
    if (sync_mode === 'replace_all') {
      console.log('[EXPORT-DOCUMENTS] Mode: replace_all - Deleting all files and folders recursively');
      try {
        await deleteFolderContentsRecursively(folder_id, accessToken, "[EXPORT-DOCUMENTS]");
        console.log(`[EXPORT-DOCUMENTS] Successfully deleted all contents of folder ${folder_id}`);
      } catch (error) {
        console.error(`[EXPORT-DOCUMENTS] Error during recursive deletion:`, error);
      }
    }

    // Cache for created folders: folder_name -> folder_id
    const folderCache = new Map<string, string>();
    // Cache для существующих файлов: file_name -> file_id (для режима replace_existing)
    const existingFilesCache = new Map<string, { id: string; folderId: string }>();

    // Если режим replace_existing, загружаем список существующих файлов
    if (sync_mode === 'replace_existing') {
      console.log('[EXPORT-DOCUMENTS] Mode: replace_existing - Loading existing files');

      let nextPageToken: string | undefined = undefined;

      do {
        const listResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q='${folder_id}' in parents and trashed=false&fields=files(id,name,parents,mimeType),nextPageToken&supportsAllDrives=true${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (listResponse.ok) {
          const listData = await listResponse.json();
          if (listData.files) {
            for (const file of listData.files) {
              if (file.mimeType !== 'application/vnd.google-apps.folder') {
                const cacheKey = `${file.name}_${file.parents?.[0] || folder_id}`;
                existingFilesCache.set(cacheKey, {
                  id: file.id,
                  folderId: file.parents?.[0] || folder_id,
                });
              }
            }
          }
          nextPageToken = listData.nextPageToken;
        } else {
          break;
        }
      } while (nextPageToken);

      console.log(`[EXPORT-DOCUMENTS] Found ${existingFilesCache.size} existing files`);
    }

    const LOG = "[EXPORT-DOCUMENTS]";
    const results: Array<{ document_id: string; success: boolean; error?: string }> = [];

    // Process single document
    async function processDocument(doc: typeof documents[number]) {
      try {
        await updateExportProgress(supabaseServiceRole, session_id, doc.document_id, 'uploading', undefined, LOG);

        // Download file from Supabase Storage
        let fileData: Blob;
        try {
          fileData = await downloadFile(supabaseServiceRole, doc.file_path, doc.file_id);
        } catch (dlErr) {
          const errorMsg = dlErr instanceof Error ? dlErr.message : "Download failed";
          results.push({ document_id: doc.document_id, success: false, error: errorMsg });
          await updateExportProgress(supabaseServiceRole, session_id, doc.document_id, 'error', errorMsg, LOG);
          return;
        }

        // Determine target folder (folder creation is sequential via cache)
        let targetFolderId = folder_id;

        if (doc.folder_name) {
          const sanitizedFolderName = doc.folder_name.replace(/[<>:"/\\|?*]/g, "_");

          if (!folderCache.has(sanitizedFolderName)) {
            const searchResponse = await fetch(
              `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(sanitizedFolderName.replace(/'/g, "\\'"))}' and '${targetFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)&supportsAllDrives=true`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            let folderId = targetFolderId;

            if (searchResponse.ok) {
              const searchData = await searchResponse.json();
              if (searchData.files && searchData.files.length > 0) {
                folderId = searchData.files[0].id;
                console.log(`${LOG} Found existing folder: ${sanitizedFolderName}`);

                if (sync_mode === 'replace_all') {
                  console.log(`${LOG} Cleaning existing folder contents: ${sanitizedFolderName}`);
                  await deleteFolderContentsRecursively(folderId, accessToken, LOG);
                }
              } else {
                console.log(`${LOG} Creating new folder: ${sanitizedFolderName}`);
                folderId = await createDriveFolder(sanitizedFolderName, targetFolderId, accessToken);
              }
            }

            folderCache.set(sanitizedFolderName, folderId);
          }

          targetFolderId = folderCache.get(sanitizedFolderName)!;
        }

        // Check existing file for replace_existing mode
        let existingFileId: string | null = null;
        if (sync_mode === 'replace_existing') {
          const cacheKey = `${doc.file_name}_${targetFolderId}`;
          const existing = existingFilesCache.get(cacheKey);
          if (existing) {
            existingFileId = existing.id;
            console.log(`${LOG} Found existing file to replace: ${doc.file_name}`);
          }
        }

        // Upload file to Google Drive
        console.log(`${LOG} Uploading file: ${doc.file_name} to folder ${targetFolderId}`);

        const metadata = {
          name: doc.file_name,
          parents: [targetFolderId],
        };

        if (existingFileId && sync_mode === 'replace_existing') {
          console.log(`${LOG} Deleting existing file before upload: ${doc.file_name}`);
          await fetch(
            `https://www.googleapis.com/drive/v3/files/${existingFileId}?supportsAllDrives=true`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
          );
        }

        const formData = new FormData();
        formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
        formData.append("file", fileData);

        const uploadResponse = await fetch(
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
          { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: formData }
        );

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          throw new Error(`Failed to upload file: ${errorText}`);
        }

        results.push({ document_id: doc.document_id, success: true });
        await updateExportProgress(supabaseServiceRole, session_id, doc.document_id, 'success', undefined, LOG);
        console.log(`${LOG} ✅ File uploaded: ${doc.file_name}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        console.error(`${LOG} Error processing document ${doc.document_id}:`, error);
        results.push({ document_id: doc.document_id, success: false, error: errorMsg });
        await updateExportProgress(supabaseServiceRole, session_id, doc.document_id, 'error', errorMsg, LOG);
      }
    }

    // Process documents in chunks of 3 for concurrency (avoid Google API rate limits)
    const CONCURRENCY = 3;
    for (let i = 0; i < documents.length; i += CONCURRENCY) {
      const chunk = documents.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(processDocument));
    }

    const successCount = results.filter((r) => r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        results,
        success_count: successCount,
        total_count: documents.length,
      }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[EXPORT-DOCUMENTS] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
