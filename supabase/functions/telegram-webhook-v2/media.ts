/**
 * Загрузка вложений из Telegram в Storage и таблицу message_attachments.
 *
 * Размер файла ограничен 20MB (Telegram Bot API лимит) — большие файлы
 * пропускаются с предупреждением в content.
 */

import { service, getBotToken } from "./shared.ts";
import { tgCall } from "./tg-api.ts";
import { collectFiles, MAX_FILE_SIZE_MB } from "./pure.ts";
import type { TgMessage } from "./types.ts";

export async function fetchTelegramFile(fileId: string): Promise<{ buffer: ArrayBuffer; path: string } | null> {
  const info = await tgCall<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
  if (!info?.file_path) return null;
  const url = `https://api.telegram.org/file/bot${getBotToken()}/${info.file_path}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return { buffer: await res.arrayBuffer(), path: info.file_path };
}

export async function downloadAttachments(msg: TgMessage, messageId: string, workspaceId: string, projectId: string) {
  const files = collectFiles(msg);
  const skipped: string[] = [];
  for (const f of files) {
    const dl = await fetchTelegramFile(f.fileId);
    if (!dl) {
      skipped.push(f.originalName);
      continue;
    }
    const storagePath = `${workspaceId}/${projectId}/${messageId}/${f.safeName}`;
    const { error: upErr } = await service.storage.from("files").upload(storagePath, dl.buffer, {
      contentType: f.mimeType,
      upsert: false,
    });
    if (upErr) {
      console.error("storage upload error:", upErr);
      continue;
    }
    const { data: fileRow, error: fileErr } = await service
      .from("files")
      .insert({
        workspace_id: workspaceId,
        bucket: "files",
        storage_path: storagePath,
        file_name: f.originalName,
        file_size: dl.buffer.byteLength,
        mime_type: f.mimeType,
      })
      .select("id")
      .single();
    if (fileErr) {
      console.error("files insert error:", fileErr);
      continue;
    }
    await service.from("message_attachments").insert({
      message_id: messageId,
      file_name: f.originalName,
      file_size: dl.buffer.byteLength,
      mime_type: f.mimeType,
      storage_path: storagePath,
      telegram_file_id: f.fileId,
      file_id: fileRow.id,
    });
  }

  if (skipped.length > 0) {
    const { data: cur } = await service
      .from("project_messages")
      .select("content")
      .eq("id", messageId)
      .single();
    const warn = skipped.length === 1
      ? `\n\n⚠️ Файл «${skipped[0]}» слишком большой (макс. ${MAX_FILE_SIZE_MB} МБ через Telegram)`
      : `\n\n⚠️ Файлы слишком большие:\n${skipped.map((n) => `• ${n}`).join("\n")}`;
    await service
      .from("project_messages")
      .update({ content: (cur?.content ?? "") + warn })
      .eq("id", messageId);
  }
}
