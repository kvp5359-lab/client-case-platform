/**
 * Выбирает токен Telegram-бота для группы.
 *
 * Этап 1 миграции (2026-05-02): токен переезжает в БД.
 *
 * Логика:
 *  1. Находим группу в `project_telegram_chats` по telegram_chat_id и берём
 *     `integration_id` + `bot_version`.
 *  2. Если у привязанной записи `workspace_integrations.secrets.token`
 *     заполнен — используем его.
 *  3. Иначе — фоллбэк на env-переменные TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_TOKEN_V2
 *     по bot_version. Это позволяет миграцию выполнять постепенно: пока в БД
 *     нет токена, поведение ровно такое же, как до миграции.
 *
 * При полном переезде поле `bot_version` останется как маркер «какая
 * env-копия использовалась исторически», а реальный токен — в БД.
 */

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

interface ResolvedToken {
  token: string;
  /** v1 / v2 — для логов и обратной совместимости с уже задеплоенным кодом. */
  botVersion: "v1" | "v2";
  /** Откуда взяли токен — для диагностики. */
  source: "db" | "env";
}

export async function resolveBotToken(
  service: SupabaseClient,
  telegramChatId: number,
): Promise<ResolvedToken> {
  const tokenV1 = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const tokenV2 = Deno.env.get("TELEGRAM_BOT_TOKEN_V2");

  let botVersion: "v1" | "v2" = "v1";
  let integrationId: string | null = null;

  try {
    const { data } = await service
      .from("project_telegram_chats")
      .select("bot_version, integration_id")
      .eq("telegram_chat_id", telegramChatId)
      .eq("is_active", true)
      .maybeSingle();
    if (data?.bot_version === "v2") botVersion = "v2";
    integrationId = (data?.integration_id as string | null) ?? null;
  } catch (err) {
    console.warn("[resolveBotToken] chat lookup failed, falling back to v1 env:", err);
  }

  // 1. Пробуем токен из БД (workspace_integrations.secrets.token)
  if (integrationId) {
    try {
      const { data: integration } = await service
        .from("workspace_integrations")
        .select("secrets, is_active")
        .eq("id", integrationId)
        .maybeSingle();
      if (integration?.is_active === false) {
        // Деактивированная интеграция — относимся как «токена нет», уходим в env.
        console.warn(`[resolveBotToken] integration ${integrationId} is inactive, falling back to env`);
      } else {
        const dbToken = (integration?.secrets as { token?: string } | null)?.token;
        if (dbToken && dbToken.length > 0) {
          return { token: dbToken, botVersion, source: "db" };
        }
      }
    } catch (err) {
      console.warn("[resolveBotToken] integration lookup failed, falling back to env:", err);
    }
  }

  // 2. Env-фоллбэк (старая логика по bot_version)
  if (botVersion === "v2") {
    if (!tokenV2) throw new Error("TELEGRAM_BOT_TOKEN_V2 is not configured");
    return { token: tokenV2, botVersion, source: "env" };
  }
  if (!tokenV1) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return { token: tokenV1, botVersion, source: "env" };
}
