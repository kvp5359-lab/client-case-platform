/**
 * Выбирает токен Telegram-бота по `bot_version` привязки группы.
 *
 * - Старые группы (`bot_version = 'v1'` или запись не найдена) → TELEGRAM_BOT_TOKEN
 * - Новые группы (`bot_version = 'v2'`) → TELEGRAM_BOT_TOKEN_V2
 *
 * Возвращает { token, botVersion }. Если ни один токен не задан в env —
 * кидает исключение (это серверная мисконфигурация).
 */

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export async function resolveBotToken(
  service: SupabaseClient,
  telegramChatId: number,
): Promise<{ token: string; botVersion: "v1" | "v2" }> {
  const tokenV1 = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const tokenV2 = Deno.env.get("TELEGRAM_BOT_TOKEN_V2");

  // Пробуем прочитать bot_version. Если колонки нет (старые БД) или запись
  // отсутствует — тихо откатываемся на v1, чтобы не сломать существующее поведение.
  let botVersion: "v1" | "v2" = "v1";
  try {
    const { data } = await service
      .from("project_telegram_chats")
      .select("bot_version")
      .eq("telegram_chat_id", telegramChatId)
      .eq("is_active", true)
      .maybeSingle();
    if (data?.bot_version === "v2") botVersion = "v2";
  } catch (err) {
    console.warn("[resolveBotToken] lookup failed, falling back to v1:", err);
  }

  if (botVersion === "v2") {
    if (!tokenV2) throw new Error("TELEGRAM_BOT_TOKEN_V2 is not configured");
    return { token: tokenV2, botVersion };
  }

  if (!tokenV1) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return { token: tokenV1, botVersion };
}
