/**
 * Shared export progress tracking helper.
 * Used by: google-drive-export-documents, export-to-drive.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type ExportStatus = "pending" | "uploading" | "success" | "error";

/**
 * Insert an export progress record for a document.
 * If `sessionId` is null/undefined, the call is silently skipped.
 * Errors are logged but never thrown — progress tracking must not interrupt the main flow.
 */
export async function updateExportProgress(
  supabase: SupabaseClient,
  sessionId: string | undefined | null,
  documentId: string,
  status: ExportStatus,
  errorMessage?: string,
  logPrefix = "[progressTracking]",
): Promise<void> {
  if (!sessionId) return;

  try {
    const { error } = await supabase
      .from("export_progress")
      .insert({
        session_id: sessionId,
        document_id: documentId,
        status,
        error_message: errorMessage ? errorMessage.slice(0, 500) : null,
      });

    if (error) {
      console.error(`${logPrefix} Insert error for ${documentId}:`, error);
    }
  } catch (error) {
    console.error(`${logPrefix} Failed to update progress for ${documentId}:`, error);
  }
}
