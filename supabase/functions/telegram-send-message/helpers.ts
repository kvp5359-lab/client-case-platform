/**
 * Helpers для telegram-send-message — вынесены из index.ts для уменьшения
 * монолита и лучшего разделения ответственности.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { escapeHtmlEntities } from "../_shared/htmlFormatting.ts";

// Telegram sendPhoto / sendMediaGroup(type=photo) принимает только эти форматы.
// Остальное (tiff, heic, bmp, svg, ...) уходит через sendDocument.
export const TELEGRAM_PHOTO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function isTelegramPhotoMime(mime: unknown): boolean {
  return typeof mime === "string" && TELEGRAM_PHOTO_MIME_TYPES.has(mime.toLowerCase());
}

// Telegram возвращает эту ошибку, когда reply_parameters.message_id указывает
// на сообщение, которого больше нет в чате. Главный кейс — миграция группы в
// супергруппу: старые message_id обнуляются, маппинга Telegram не отдаёт.
export function isReplyNotFoundError(tgData: unknown): boolean {
  if (!tgData || typeof tgData !== "object") return false;
  const data = tgData as { error_code?: number; description?: unknown };
  return (
    data.error_code === 400 &&
    typeof data.description === "string" &&
    /message to be replied not found/i.test(data.description)
  );
}

// Загружает текст сообщения, на которое отвечают, и формирует HTML-blockquote
// для вставки в начало нового сообщения. Используется как UX-fallback, когда
// нативный Telegram-reply невозможен (см. isReplyNotFoundError).
export async function loadReplyQuoteHtml(
  serviceClient: ReturnType<typeof createClient>,
  currentMessageId: string,
): Promise<string | null> {
  const { data: cur } = await serviceClient
    .from("project_messages")
    .select("reply_to_message_id")
    .eq("id", currentMessageId)
    .maybeSingle();
  const origId = (cur as { reply_to_message_id?: string } | null)?.reply_to_message_id;
  if (!origId) return null;

  const { data: orig } = await serviceClient
    .from("project_messages")
    .select("content, sender_name")
    .eq("id", origId)
    .maybeSingle();
  const origRow = orig as { content?: string; sender_name?: string | null } | null;
  if (!origRow?.content) return null;

  const plain = String(origRow.content).replace(/<[^>]+>/g, "").trim();
  if (!plain) return null;
  const truncated = plain.length > 200 ? plain.slice(0, 200) + "…" : plain;
  const senderPrefix = origRow.sender_name
    ? `<b>${escapeHtmlEntities(origRow.sender_name)}</b>\n`
    : "";
  return `<blockquote>${senderPrefix}${escapeHtmlEntities(truncated)}</blockquote>`;
}
