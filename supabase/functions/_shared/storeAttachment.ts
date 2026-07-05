/**
 * Общий helper для сохранения вложения: загрузка buffer'а в Storage +
 * создание записей в `files` и `message_attachments`.
 *
 * Каждый канал-webhook (telegram, wazzup, gmail) скачивает медиа по своему
 * (через Bot API / contentUri / Gmail attachments-API) — но дальше делает
 * ОДНО И ТО ЖЕ:
 *   - upload в bucket `files` по пути `<workspace>/<project>/<message>/<safeName>`
 *   - INSERT в `files` (workspace_id, bucket, storage_path, file_name, …)
 *   - INSERT в `message_attachments` (message_id, file_id, file_name, …)
 *
 * Единая точка — единая правка при изменении path-формата или схемы.
 */

import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { STORAGE_BUCKETS, storageUpload } from "../_shared/storage.ts";

export interface StoreAttachmentInput {
  buffer: ArrayBuffer;
  mimeType: string;
  fileName: string;
  workspaceId: string;
  projectId: string;
  messageId: string;
  /**
   * Канал-специфичный id у внешнего сервиса (telegram_file_id, wazzup
   * messageId-фрагмент, gmail attachment id, …). Сохраняется в
   * `message_attachments.<channelIdField>`. По умолчанию не пишется.
   */
  externalIdField?: string;
  externalId?: string | null;
}

export interface StoreAttachmentResult {
  storage_path: string;
  file_id: string;
  attachment_id: string;
}

/** Заменяет «опасные» символы пути на `_`. */
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_") || `file_${Date.now()}`;
}

export async function storeAttachment(
  service: SupabaseClient,
  input: StoreAttachmentInput,
): Promise<StoreAttachmentResult | null> {
  const safeName = sanitizeName(input.fileName);
  const storagePath =
    `${input.workspaceId}/${input.projectId}/${input.messageId}/${safeName}`;

  const { error: upErr } = await storageUpload(service, STORAGE_BUCKETS.files, 
    storagePath,
    input.buffer,
    { contentType: input.mimeType, upsert: false },
  );
  if (upErr) {
    console.error("[storeAttachment] storage upload error:", upErr);
    return null;
  }

  const { data: fileRow, error: fileErr } = await service
    .from("files")
    .insert({
      workspace_id: input.workspaceId,
      bucket: "files",
      storage_path: storagePath,
      file_name: input.fileName,
      file_size: input.buffer.byteLength,
      mime_type: input.mimeType,
    })
    .select("id")
    .single();
  if (fileErr || !fileRow) {
    console.error("[storeAttachment] files insert error:", fileErr);
    return null;
  }

  const attachmentRow: Record<string, unknown> = {
    message_id: input.messageId,
    file_name: input.fileName,
    file_size: input.buffer.byteLength,
    mime_type: input.mimeType,
    storage_path: storagePath,
    file_id: fileRow.id,
  };
  if (input.externalIdField && input.externalId) {
    attachmentRow[input.externalIdField] = input.externalId;
  }

  const { data: attachment, error: attachErr } = await service
    .from("message_attachments")
    .insert(attachmentRow)
    .select("id")
    .single();
  if (attachErr || !attachment) {
    console.error("[storeAttachment] message_attachments insert error:", attachErr);
    return null;
  }

  return {
    storage_path: storagePath,
    file_id: fileRow.id as string,
    attachment_id: attachment.id as string,
  };
}
