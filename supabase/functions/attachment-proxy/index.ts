/**
 * attachment-proxy — отдаёт файл вложения ВНЕШНЕМУ сервису по простой ссылке
 * (без чувствительных query-параметров R2-подписи). Нужен для каналов, которые
 * сами скачивают файл по URL (Wazzup contentUri): R2 presigned-ссылку они не
 * могут забрать, а эту — могут.
 *
 * GET /functions/v1/attachment-proxy/<token>[/<filename>]
 * Токен (сегмент сразу после `attachment-proxy`) подписан HMAC на
 * INTERNAL_FUNCTION_SECRET (см. _shared/attachmentToken.ts), несёт storage_path +
 * content-type + имя + срок. Подделать нельзя, живёт 1ч. Необязательный
 * последний сегмент <filename> — чтобы внешний сервис (Wazzup) показал
 * человеческое имя файла (он берёт имя из последнего сегмента URL).
 *
 * Деплой: --no-verify-jwt (внешний сервис без JWT; защита — HMAC-токен).
 */

import { getServiceClient } from "../_shared/edge.ts";
import { STORAGE_BUCKETS, storageDownload } from "../_shared/storage.ts";
import { verifyAttachmentToken } from "../_shared/attachmentToken.ts";

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("method not allowed", { status: 405 });

  const url = new URL(req.url);
  // Токен = сегмент сразу после `attachment-proxy`; далее может идти <filename>.
  const parts = url.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("attachment-proxy");
  const token = i >= 0 ? (parts[i + 1] ?? "") : (parts[parts.length - 1] ?? "");
  const payload = await verifyAttachmentToken(token);
  if (!payload) return new Response("forbidden", { status: 403 });

  const service = getServiceClient();
  // Бакет берём из токена. Старые токены (выпущены до 2026-07-22, живут 1ч) его
  // не несут — для них перебираем оба: вложения лежат либо в `files` (приём через
  // бота/почту), либо в `message-attachments` (приём личного Telegram).
  const buckets = payload.b
    ? [payload.b]
    : [STORAGE_BUCKETS.files, STORAGE_BUCKETS.messageAttachments];
  let blob: Blob | null = null;
  for (const bucket of buckets) {
    const { data } = await storageDownload(service, bucket, payload.p);
    if (data) {
      blob = data as Blob;
      break;
    }
  }
  if (!blob) return new Response("not found", { status: 404 });

  const headers = new Headers();
  headers.set("Content-Type", payload.ct || (blob as Blob).type || "application/octet-stream");
  if (payload.fn) {
    headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(payload.fn)}`);
  }
  headers.set("Cache-Control", "private, max-age=3600");
  return new Response(blob, { status: 200, headers });
});
