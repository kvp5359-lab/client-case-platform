/**
 * Привязка Telegram-группы к проекту (project_telegram_chats).
 * Используется в каждом handler'е для определения какой workspace/project/thread
 * стоят за входящим chat_id.
 */

import { service, BOT_VERSION } from "./shared.ts";
import type { TgChatBinding } from "./types.ts";

/** Найти привязку группы с фильтром v2. Возвращает null, если группа не привязана или привязана к v1. */
export async function findChatBinding(chatId: number): Promise<TgChatBinding | null> {
  const { data } = await service
    .from("project_telegram_chats")
    .select("project_id, workspace_id, channel, thread_id")
    .eq("telegram_chat_id", chatId)
    .eq("is_active", true)
    .eq("bot_version", BOT_VERSION)
    .maybeSingle();
  return data ?? null;
}
