/**
 * Многошаговые сценарии бота через таблицу telegram_bot_sessions.
 *
 * Например: «выбрал слот для загрузки» → сохраняем state="await_slot_file"
 * + context={slot_id}. Следующее сообщение с файлом проверяет state и
 * загружает файл в выбранный слот.
 *
 * TTL — 30 минут. Истёкшие сессии чистятся при попытке прочитать.
 */

import { service } from "./shared.ts";
import type { BotSession } from "./types.ts";

export async function getSession(chatId: number, userId: number): Promise<BotSession | null> {
  const { data } = await service
    .from("telegram_bot_sessions")
    .select("state, context, expires_at")
    .eq("telegram_chat_id", chatId)
    .eq("telegram_user_id", userId)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await clearSession(chatId, userId);
    return null;
  }
  return { state: data.state, context: data.context ?? {} };
}

export async function setSession(chatId: number, userId: number, state: string, context: Record<string, unknown>) {
  await service.from("telegram_bot_sessions").upsert(
    {
      telegram_chat_id: chatId,
      telegram_user_id: userId,
      state,
      context,
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    },
    { onConflict: "telegram_chat_id,telegram_user_id" },
  );
}

export async function clearSession(chatId: number, userId: number) {
  await service
    .from("telegram_bot_sessions")
    .delete()
    .eq("telegram_chat_id", chatId)
    .eq("telegram_user_id", userId);
}
