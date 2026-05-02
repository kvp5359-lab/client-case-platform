/**
 * Выбор Telegram-бота для отправки/редактирования/удаления сообщений.
 *
 * Этап 2 миграции (личные боты сотрудников):
 *  - Если сообщение уже отправлено и в `project_messages.telegram_bot_integration_id`
 *    лежит ID интеграции — берём именно её токен (edit/delete/reaction должны
 *    идти через того же бота, который отправил исходник).
 *  - Иначе при отправке: пытаемся найти личный бот сотрудника по
 *    `participants.user_id` → `workspace_integrations(type=telegram_employee_bot,
 *    config.owner_user_id=...)`. Если есть и активен — используем его.
 *  - Иначе — бот-секретарь (workspace_integrations type=telegram_workspace_bot,
 *    привязка через `project_telegram_chats.integration_id`). Если в его
 *    `secrets.token` пусто — фоллбэк на env TELEGRAM_BOT_TOKEN/_V2 по
 *    `bot_version` (страховка переходного периода).
 */

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

interface ResolvedToken {
  token: string;
  /** UUID записи workspace_integrations, через которую был отправлен/будет отправлен. NULL для env-fallback. */
  integrationId: string | null;
  /** Тип отправителя — нужен для решения «писать ли префикс «(Имя)» в тексте». */
  senderType: "workspace_bot" | "employee_bot" | "env_fallback";
  /** v1/v2 для логов и обратной совместимости. */
  botVersion: "v1" | "v2";
  /** Откуда взяли токен — для диагностики. */
  source: "db" | "env";
}

/** Получить токен по уже сохранённому на сообщении integration_id. */
export async function resolveTokenByIntegrationId(
  service: SupabaseClient,
  integrationId: string,
): Promise<ResolvedToken | null> {
  const { data } = await service
    .from("workspace_integrations")
    .select("id, type, is_active, config, secrets")
    .eq("id", integrationId)
    .maybeSingle();
  if (!data || data.is_active === false) return null;
  const token = (data.secrets as { token?: string } | null)?.token;
  if (!token) return null;

  const type = data.type as "telegram_workspace_bot" | "telegram_employee_bot";
  const botVersion =
    (data.config as { bot_version?: "v1" | "v2" } | null)?.bot_version === "v2"
      ? "v2"
      : "v1";

  return {
    token,
    integrationId: data.id as string,
    senderType: type === "telegram_employee_bot" ? "employee_bot" : "workspace_bot",
    botVersion,
    source: "db",
  };
}

/**
 * Поиск личного бота сотрудника. Возвращает запись `workspace_integrations`
 * с заполненным токеном, либо null. workspace определяется через
 * project_telegram_chats по telegram_chat_id.
 *
 * Работает и в basic-группах, и в супергруппах. Связка ответов в basic
 * решается тем, что у личного бота настроен собственный webhook (с
 * `secret_token = workspace_integrations.id`) — он получает события
 * «ответ на моё сообщение» в своём counter и сохраняет реплай в БД.
 */
export async function findEmployeeBot(
  service: SupabaseClient,
  _telegramChatId: number,
  senderParticipantId: string | null,
): Promise<ResolvedToken | null> {
  if (!senderParticipantId) return null;

  // 1. Узнаём workspace_id чата + user_id участника.
  const { data: chat } = await service
    .from("project_telegram_chats")
    .select("workspace_id")
    .eq("telegram_chat_id", _telegramChatId)
    .eq("is_active", true)
    .maybeSingle();
  if (!chat?.workspace_id) return null;

  const { data: participant } = await service
    .from("participants")
    .select("user_id")
    .eq("id", senderParticipantId)
    .maybeSingle();
  if (!participant?.user_id) return null;

  // 2. Ищем активную интеграцию-личный-бот этого user в этой юрфирме.
  const { data: rows } = await service
    .from("workspace_integrations")
    .select("id, is_active, config, secrets")
    .eq("workspace_id", chat.workspace_id)
    .eq("type", "telegram_employee_bot")
    .eq("is_active", true);
  if (!rows || rows.length === 0) return null;

  const match = rows.find(
    (r) =>
      (r.config as { owner_user_id?: string } | null)?.owner_user_id === participant.user_id,
  );
  if (!match) return null;

  const token = (match.secrets as { token?: string } | null)?.token;
  if (!token) return null;

  return {
    token,
    integrationId: match.id as string,
    senderType: "employee_bot",
    botVersion: "v1", // личные боты пока без v1/v2 разделения
    source: "db",
  };
}

/**
 * Старая логика — выбор бота-секретаря по telegram_chat_id с env-фоллбэком.
 * Используется как запасной путь и когда личного бота нет.
 */
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

  if (integrationId) {
    try {
      const { data: integration } = await service
        .from("workspace_integrations")
        .select("secrets, is_active")
        .eq("id", integrationId)
        .maybeSingle();
      if (integration?.is_active === false) {
        console.warn(`[resolveBotToken] integration ${integrationId} is inactive, falling back to env`);
      } else {
        const dbToken = (integration?.secrets as { token?: string } | null)?.token;
        if (dbToken && dbToken.length > 0) {
          return {
            token: dbToken,
            integrationId,
            senderType: "workspace_bot",
            botVersion,
            source: "db",
          };
        }
      }
    } catch (err) {
      console.warn("[resolveBotToken] integration lookup failed, falling back to env:", err);
    }
  }

  if (botVersion === "v2") {
    if (!tokenV2) throw new Error("TELEGRAM_BOT_TOKEN_V2 is not configured");
    return {
      token: tokenV2,
      integrationId: null,
      senderType: "env_fallback",
      botVersion,
      source: "env",
    };
  }
  if (!tokenV1) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return {
    token: tokenV1,
    integrationId: null,
    senderType: "env_fallback",
    botVersion,
    source: "env",
  };
}
