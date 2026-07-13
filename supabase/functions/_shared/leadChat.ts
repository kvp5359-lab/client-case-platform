// Единая точка определения «чат привязан к лид-боту» для исходящих путей
// (telegram-send-message, telegram-set-reaction). Раньше этот lookup был
// продублирован в обеих функциях.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface LeadChatInfo {
  /** Чат — личка рекламного лид-бота (telegram_lead_bot). */
  isLead: boolean;
  /** Показывать префикс «Имя:» в исходящих (config.show_sender_name). */
  showSenderName: boolean;
}

/**
 * По integration_id чата (из project_telegram_chats) определяет, лид-бот ли это,
 * и нужно ли добавлять имя отправителя. integration_id NULL (легаси-группа) или
 * не лид-бот → { isLead: false }.
 */
export async function getLeadChatInfo(
  service: SupabaseClient,
  integrationId: string | null | undefined,
): Promise<LeadChatInfo> {
  if (!integrationId) return { isLead: false, showSenderName: false };
  const { data } = await service
    .from("workspace_integrations")
    .select("type, config")
    .eq("id", integrationId)
    .maybeSingle();
  const isLead = (data as { type?: string } | null)?.type === "telegram_lead_bot";
  const showSenderName =
    isLead &&
    (data as { config?: { show_sender_name?: boolean } } | null)?.config
      ?.show_sender_name === true;
  return { isLead, showSenderName };
}
