/**
 * Обработка автоматического апгрейда обычной Telegram-группы в супергруппу.
 *
 * Когда Telegram автоматически конвертирует обычную группу в супергруппу
 * (происходит при определённых действиях ботов/админов), chat_id меняется:
 * старый отрицательный → новый отрицательный с префиксом "-100".
 * Telegram отвечает 400 с description "group chat was upgraded to a
 * supergroup chat" и полем parameters.migrate_to_chat_id = <новый id>.
 *
 * Без обработки этого случая старый chat_id остаётся в нашей БД, и все
 * последующие отправки в эту группу падают с той же ошибкой.
 */

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface TgErrorResponse {
  ok?: boolean;
  error_code?: number;
  description?: string;
  parameters?: { migrate_to_chat_id?: number };
}

/**
 * Если ответ Telegram — про апгрейд в супергруппу, обновляет
 * `project_telegram_chats.telegram_chat_id` со старого id на новый и
 * возвращает новый id. Иначе возвращает null.
 */
export async function detectChatMigration(
  service: SupabaseClient,
  oldChatId: number,
  tgData: TgErrorResponse,
): Promise<number | null> {
  if (tgData.ok) return null;
  if (tgData.error_code !== 400) return null;
  const desc = tgData.description?.toLowerCase() ?? "";
  if (!desc.includes("upgraded to a supergroup")) return null;
  const newId = tgData.parameters?.migrate_to_chat_id;
  if (typeof newId !== "number") return null;

  console.warn(
    `[telegram-migration] chat ${oldChatId} → ${newId} (group upgraded to supergroup)`,
  );

  await service
    .from("project_telegram_chats")
    .update({ telegram_chat_id: newId })
    .eq("telegram_chat_id", oldChatId);

  return newId;
}
