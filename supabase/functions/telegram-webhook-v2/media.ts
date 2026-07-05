/**
 * Загрузка вложений из Telegram в Storage и таблицу message_attachments.
 *
 * Стратегия (после фикса 2026-05-27):
 * - Перед скачиванием помечаем сообщение `attachment_status='pending'`,
 *   чтобы UI мог показать "Загружается…" сразу после прихода сообщения.
 * - На каждый файл делаем до 3 попыток с exponential backoff на 429 / сетевые
 *   ошибки. Это покрывает rate-limit при media_group (раньше второй-третий
 *   файл в группе молча терялся).
 * - При финальном провале хотя бы одного файла → пишем `attachment_status='failed'`
 *   и сериализованную причину в `attachment_error`. UI показывает плашку
 *   "Файл не загрузился из Telegram", пользователь идёт за файлом в TG руками.
 * - Если все файлы успешно загружены → `attachment_status=NULL` (ничего не пишем).
 *
 * Размер файла ограничен 20 МБ (Telegram Bot API лимит) — большие файлы
 * пропускаются с предупреждением в content (это НЕ считается failed —
 * клиент должен прислать файл иначе, не наш баг).
 */

import { service } from "./shared.ts";
import { collectFiles, MAX_FILE_SIZE_MB } from "./pure.ts";
import type { TgFileDescriptor, TgMessage } from "./types.ts";
import { STORAGE_BUCKETS, storageUpload } from "../_shared/storage.ts";

const MAX_FETCH_ATTEMPTS = 3;
/** Базовая задержка между ретраями (мс). На каждой попытке удваивается. */
const RETRY_BASE_DELAY_MS = 400;

type FetchResult =
  | { ok: true; buffer: ArrayBuffer; path: string }
  | { ok: false; reason: string; httpStatus: number | null; attempts: number };

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** getFile через ЯВНЫЙ токен (не глобаль) — иначе гонка между ботами группы. */
async function getFilePath(
  fileId: string,
  botToken: string,
): Promise<{ file_path?: string } | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    const json = await res.json();
    if (!json.ok) {
      console.error("[tg getFile] error:", json.description, { file_id: fileId });
      return null;
    }
    return json.result as { file_path?: string };
  } catch (err) {
    console.error("[tg getFile] fetch failed:", err);
    return null;
  }
}

/**
 * Скачать файл из Telegram с ретраями. Возвращает успех или причину провала.
 * Ретраит при 429, 5xx и сетевых ошибках. Не ретраит при 400/404 — это
 * "файл больше нельзя получить", повторять бессмысленно.
 *
 * `botToken` передаётся ЯВНО (см. IntegrationContext.botToken). НЕ брать из
 * глобального getBotToken() — при параллельных ботах группы её перетирают.
 */
export async function fetchTelegramFile(
  fileId: string,
  botToken: string,
): Promise<FetchResult> {
  let lastReason = "unknown";
  let lastHttpStatus: number | null = null;

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    try {
      const info = await getFilePath(fileId, botToken);
      if (!info?.file_path) {
        // getFile на ошибке вернул null — например 400 (file_id просрочен) либо
        // file_id чужого бота. Повторять бесполезно, выходим.
        return {
          ok: false,
          reason: "getFile returned no file_path",
          httpStatus: null,
          attempts: attempt,
        };
      }

      const url = `https://api.telegram.org/file/bot${botToken}/${info.file_path}`;
      const res = await fetch(url);
      if (!res.ok) {
        lastHttpStatus = res.status;
        lastReason = `download HTTP ${res.status}`;
        // 429/5xx — ретраим. 4xx (кроме 429) — необратимо.
        if (res.status === 429 || res.status >= 500) {
          if (attempt < MAX_FETCH_ATTEMPTS) {
            await delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
            continue;
          }
        }
        return { ok: false, reason: lastReason, httpStatus: lastHttpStatus, attempts: attempt };
      }

      const buffer = await res.arrayBuffer();
      return { ok: true, buffer, path: info.file_path };
    } catch (err) {
      // Сетевая ошибка / DNS / TLS — ретраим.
      lastReason = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_FETCH_ATTEMPTS) {
        await delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
        continue;
      }
      return { ok: false, reason: lastReason, httpStatus: lastHttpStatus, attempts: attempt };
    }
  }

  return { ok: false, reason: lastReason, httpStatus: lastHttpStatus, attempts: MAX_FETCH_ATTEMPTS };
}

type FailedFile = {
  file_name: string;
  file_id: string;
  reason: string;
  http_status: number | null;
  attempts: number;
};

export async function downloadAttachments(
  msg: TgMessage,
  messageId: string,
  workspaceId: string,
  projectId: string,
  botToken: string,
): Promise<{ ok: number; failed: FailedFile[] }> {
  const files = collectFiles(msg);
  if (files.length === 0) {
    return { ok: 0, failed: [] };
  }

  // Помечаем сообщение pending, чтобы UI знал "идёт загрузка".
  await service
    .from("project_messages")
    .update({ attachment_status: "pending", attachment_error: null })
    .eq("id", messageId);

  const skippedTooLarge: { name: string; sizeMb: number }[] = [];
  const failed: FailedFile[] = [];
  let ok = 0;

  for (const f of files) {
    const result = await processSingleFile(f, messageId, workspaceId, projectId, botToken);
    if (result.kind === "ok") ok++;
    else if (result.kind === "too_large") {
      skippedTooLarge.push({ name: f.originalName, sizeMb: result.sizeMb });
    } else failed.push(result.info);
  }

  // Итоговое состояние сообщения:
  // - есть упавшие → status=failed + детали в attachment_error
  // - все ОК (или единственная проблема — слишком большой файл) → status=NULL
  if (failed.length > 0) {
    await service
      .from("project_messages")
      .update({
        attachment_status: "failed",
        attachment_error: {
          stage: "download",
          failed_files: failed,
          ok_files: ok,
          total_files: files.length,
          failed_at: new Date().toISOString(),
        },
      })
      .eq("id", messageId);
  } else {
    await service
      .from("project_messages")
      .update({ attachment_status: null, attachment_error: null })
      .eq("id", messageId);
  }

  if (skippedTooLarge.length > 0) {
    const { data: cur } = await service
      .from("project_messages")
      .select("content")
      .eq("id", messageId)
      .single();
    const fmt = (s: number) => s.toFixed(1).replace(".", ",");
    const warn = skippedTooLarge.length === 1
      ? `\n\n⚠️ Файл «${skippedTooLarge[0].name}» слишком большой — ${fmt(skippedTooLarge[0].sizeMb)} МБ (макс. ${MAX_FILE_SIZE_MB} МБ через Telegram)`
      : `\n\n⚠️ Файлы слишком большие:\n${skippedTooLarge.map((f) => `• ${f.name} (${fmt(f.sizeMb)} МБ)`).join("\n")}`;
    const tooLargeUpdate: Record<string, unknown> = {
      content: (cur?.content ?? "") + warn,
    };
    // attachment_error пишем only при отсутствии hard-fail'ов: иначе блок выше
    // уже записал download-детали (stage='download', failed_files) — они
    // важнее для диагностики, чем too_large, и не должны затираться.
    // Диагностика too_large: фактический размер скачанного файла. Для сжатого
    // фото >20 МБ нетипично — если всплывёт «2 МБ», значит баг подсчёта/скачивания.
    // Открытый вопрос в messenger-ledger.md.
    if (failed.length === 0) {
      tooLargeUpdate.attachment_error = {
        stage: "too_large",
        files: skippedTooLarge,
        limit_mb: MAX_FILE_SIZE_MB,
        at: new Date().toISOString(),
      };
    }
    await service
      .from("project_messages")
      .update(tooLargeUpdate)
      .eq("id", messageId);
  }

  return { ok, failed };
}

type ProcessResult =
  | { kind: "ok" }
  | { kind: "too_large"; sizeMb: number }
  | { kind: "failed"; info: FailedFile };

async function processSingleFile(
  f: TgFileDescriptor,
  messageId: string,
  workspaceId: string,
  projectId: string,
  botToken: string,
): Promise<ProcessResult> {
  const dl = await fetchTelegramFile(f.fileId, botToken);
  if (!dl.ok) {
    return {
      kind: "failed",
      info: {
        file_name: f.originalName,
        file_id: f.fileId,
        reason: dl.reason,
        http_status: dl.httpStatus,
        attempts: dl.attempts,
      },
    };
  }

  const sizeMb = dl.buffer.byteLength / (1024 * 1024);
  if (sizeMb > MAX_FILE_SIZE_MB) {
    return { kind: "too_large", sizeMb };
  }

  const storagePath = `${workspaceId}/${projectId}/${messageId}/${f.safeName}`;
  const { error: upErr } = await storageUpload(service, STORAGE_BUCKETS.files, storagePath, dl.buffer, {
    contentType: f.mimeType,
    upsert: false,
  });
  if (upErr) {
    console.error("storage upload error:", upErr);
    return {
      kind: "failed",
      info: {
        file_name: f.originalName,
        file_id: f.fileId,
        reason: `storage upload: ${upErr.message}`,
        http_status: null,
        attempts: 1,
      },
    };
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
    return {
      kind: "failed",
      info: {
        file_name: f.originalName,
        file_id: f.fileId,
        reason: `files insert: ${fileErr.message}`,
        http_status: null,
        attempts: 1,
      },
    };
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

  return { kind: "ok" };
}
