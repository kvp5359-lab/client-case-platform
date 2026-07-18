/**
 * Единый threading для WhatsApp-каналов (Wazzup + WAHA).
 *
 * Правило: WhatsApp-тред = (владелец, телефон). Независимо от того, каким
 * каналом пришло сообщение, клиент всегда попадает в ОДИН тред — ключ канонический
 * телефон (`project_threads.whatsapp_phone`, только цифры). На каждый входящий
 * тред переключается на канал-доставщик (ставим его привязку, СНИМАЕМ привязку
 * другого WhatsApp-канала) → у треда всегда ровно одна активная привязка, и
 * исходящие маршрутизируются существующим триггером без изменений («последний
 * канал клиента = канал ответа»).
 *
 * Ограничение: не держать один и тот же номер одновременно на обоих каналах —
 * тогда входящее придёт дважды (у Wazzup и WAHA независимые id) и задвоится.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/** Голые цифры телефона (без +, пробелов и т.п.). */
export function normalizePhone(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** Найти единый WhatsApp-тред клиента по (владелец, телефон). */
export async function findWhatsAppThreadByPhone(
  service: SupabaseClient, ownerUserId: string, phone: string,
): Promise<{ id: string; project_id: string | null } | null> {
  if (!phone) return null;
  const { data } = await service.from("project_threads")
    .select("id, project_id")
    .eq("owner_user_id", ownerUserId).eq("whatsapp_phone", phone)
    .eq("is_deleted", false).limit(1).maybeSingle();
  return (data as { id: string; project_id: string | null } | null) ?? null;
}

/** Переключить тред на канал WAHA (снять Wazzup-привязку). */
export async function bindThreadToWaha(
  service: SupabaseClient, threadId: string,
  a: { sessionId: string; chatId: string; phone: string },
): Promise<void> {
  await service.from("project_threads").update({
    waha_session_id: a.sessionId, waha_chat_id: a.chatId, waha_group: false,
    wazzup_channel_id: null, wazzup_chat_id: null,
    whatsapp_phone: a.phone,
  }).eq("id", threadId);
}

/** Переключить тред на канал Wazzup (снять WAHA-привязку). */
export async function bindThreadToWazzup(
  service: SupabaseClient, threadId: string,
  a: { channelDbId: string; chatId: string; chatType: string; phone: string },
): Promise<void> {
  await service.from("project_threads").update({
    wazzup_channel_id: a.channelDbId, wazzup_chat_id: a.chatId, wazzup_chat_type: a.chatType,
    waha_session_id: null, waha_chat_id: null, waha_group: false,
    whatsapp_phone: a.phone,
  }).eq("id", threadId);
}
