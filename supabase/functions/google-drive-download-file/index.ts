import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getValidAccessTokenForUser } from "../_shared/googleDriveToken.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { findInvalidUUID, isValidGoogleDriveId } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // Create service role client for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Z8-17: проверка формата Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const userToken = authHeader.slice(7);
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(userToken);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const { fileId, documentKitId, documentId, workspaceId } = await req.json();

    if (!fileId || !documentKitId || !documentId || !workspaceId) {
      return new Response(
        JSON.stringify({ error: "fileId, documentKitId, documentId and workspaceId are required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Z8-03: Validate Google Drive fileId format
    if (!isValidGoogleDriveId(fileId)) {
      return new Response(
        JSON.stringify({ error: "Invalid Google Drive file ID" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const invalidField = findInvalidUUID(
      { documentKitId, documentId, workspaceId },
      ["documentKitId", "documentId", "workspaceId"]
    );
    if (invalidField) {
      return new Response(
        JSON.stringify({ error: `${invalidField} must be a valid UUID` }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Проверка принадлежности к workspace (Z8-03)
    const isMember = await checkWorkspaceMembership(supabaseAdmin, user.id, workspaceId);
    if (!isMember) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Get valid Google Drive access token (auto-refreshes if needed)
    const accessToken = await getValidAccessTokenForUser(supabaseAdmin, user.id);

    // Get file metadata from Google Drive
    const metadataResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size&supportsAllDrives=true`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text();
      console.error('Failed to get file metadata:', errorText);
      return new Response(
        JSON.stringify({ error: "Failed to get file metadata from Google Drive" }),
        { status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const metadata = await metadataResponse.json();

    // Download file from Google Drive
    const fileResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!fileResponse.ok) {
      const errorText = await fileResponse.text();
      console.error('Failed to download file:', errorText);
      return new Response(
        JSON.stringify({ error: "Failed to download file from Google Drive" }),
        { status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const fileBlob = await fileResponse.blob();
    const fileBuffer = await fileBlob.arrayBuffer();

    // Generate unique file path
    const timestamp = Date.now();
    const fileName = metadata.name;
    const storagePath = `${workspaceId}/${documentKitId}/${documentId}/${timestamp}_${fileName}`;

    // Upload to Supabase Storage (бакет 'files')
    const { data: uploadData, error: uploadError } = await supabaseAdmin
      .storage
      .from("files")
      .upload(storagePath, fileBuffer, {
        contentType: metadata.mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    console.log('File uploaded successfully:', uploadData.path);

    // Create files table record (единый реестр)
    const fileSize = parseInt(metadata.size || "0");
    const { data: filesRecord, error: filesError } = await supabaseAdmin
      .from("files")
      .insert({
        workspace_id: workspaceId,
        bucket: "files",
        storage_path: storagePath,
        file_name: fileName,
        file_size: fileSize || 1,
        mime_type: metadata.mimeType,
        uploaded_by: user.id,
      })
      .select("id")
      .single();

    if (filesError) {
      console.error("Files record error:", filesError);
      await supabaseAdmin.storage.from("files").remove([storagePath]);
      throw new Error(`Failed to create files record: ${filesError.message}`);
    }

    // Create document_files entry using admin client
    console.log('Creating document_files entry...');
    const { data: documentFile, error: documentFileError } = await supabaseAdmin
      .from("document_files")
      .insert({
        document_id: documentId,
        workspace_id: workspaceId,
        file_path: storagePath,
        file_name: fileName,
        file_size: fileSize,
        mime_type: metadata.mimeType,
        uploaded_by: user.id,
        file_id: filesRecord.id,
      })
      .select()
      .single();

    if (documentFileError) {
      console.error("Document file creation error:", documentFileError);
      // Z8-03: cleanup orphaned storage file and files record
      await supabaseAdmin.storage.from("files").remove([storagePath]);
      await supabaseAdmin.from("files").delete().eq("id", filesRecord.id);
      throw new Error(`Failed to create document file entry: ${documentFileError.message}`);
    }

    console.log('Document file entry created:', documentFile.id);

    return new Response(
      JSON.stringify({
        success: true,
        documentFile,
      }),
      {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Download file error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
});
