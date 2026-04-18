/**
 * Shared Supabase Storage helpers.
 * Used by: compress-document, check-document, google-drive-export-documents, export-to-drive.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface StorageFileInfo {
  bucket: string;
  storagePath: string;
}

/**
 * Resolve the actual bucket and storage path for a document file.
 * If `fileId` is provided, looks up the `files` table for the real location.
 * Falls back to `document-files` bucket with the original `filePath`.
 */
export async function resolveFileLocation(
  supabase: SupabaseClient,
  filePath: string,
  fileId?: string | null,
): Promise<StorageFileInfo> {
  let bucket = "document-files";
  let storagePath = filePath;

  if (fileId) {
    const { data: fileRecord } = await supabase
      .from("files")
      .select("bucket, storage_path")
      .eq("id", fileId)
      .maybeSingle();

    if (fileRecord) {
      bucket = fileRecord.bucket;
      storagePath = fileRecord.storage_path;
    }
  }

  return { bucket, storagePath };
}

/**
 * Download a file from Supabase Storage.
 * Resolves the actual bucket/path via `files` table if `fileId` is provided.
 *
 * @returns Blob of the file data
 * @throws Error if download fails
 */
export async function downloadFile(
  supabase: SupabaseClient,
  filePath: string,
  fileId?: string | null,
): Promise<Blob> {
  const { bucket, storagePath } = await resolveFileLocation(supabase, filePath, fileId);

  const { data, error } = await supabase.storage
    .from(bucket)
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Failed to download file: ${error?.message || "Unknown error"}`);
  }

  return data;
}

/**
 * Upload a file to Supabase Storage.
 *
 * @returns void (throws on error)
 */
export async function uploadFile(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  data: ArrayBuffer | Blob,
  contentType: string,
): Promise<void> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, data, {
      cacheControl: "3600",
      upsert: false,
      contentType,
    });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}
