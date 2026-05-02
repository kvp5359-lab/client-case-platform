/**
 * Выбор Telegram-бота для отправки/редактирования/удаления сообщений.
 *
 * Все токены живут в `workspace_integrations.secrets.token`. Env-fallback
 * (TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_TOKEN_V2) больше не используется —
 * убран после переноса в БД.
 *
 *  - Если у сообщения уже есть `telegram_bot_integration_id`, токен берём
 *    оттуда (edit/delete/reaction должны идти через того же бота, который
 *    отправил исходное сообщение).
 *  - При отправке: сначала ищем личный бот сотрудника-отправителя в его
 *    воркспейсе. Если есть и активен — используем его токен.
 *  - Иначе — бот-секретарь, привязанный к группе через
 *    `project_telegram_chats.integration_id`.
 */

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

interface ResolvedToken {
  token: string;
  integrationId: string | null;
  senderType: "workspace_bot" | "employee_bot";
  /** v1/v2 для логов и обратной совместимости. */
  botVersion: "v1" | "v2";
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
  };
}

/**
 * Поиск личного бота сотрудника. Возвращает токен личного бота, либо null.
 */
export async function findEmployeeBot(
  service: SupabaseClient,
  telegramChatId: number,
  senderParticipantId: string | null,
): Promise<ResolvedToken | null> {
  if (!senderParticipantId) return null;

  const { data: chat } = await service
    .from("project_telegram_chats")
    .select("workspace_id")
    .eq("telegram_chat_id", telegramChatId)
    .eq("is_active", true)
    .maybeSingle();
  if (!chat?.workspace_id) return null;

  const { data: participant } = await service
    .from("participants")
    .select("user_id")
    .eq("id", senderParticipantId)
    .maybeSingle();
  if (!participant?.user_id) return null;

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
    botVersion: "v1",
  };
}

/**
 * Получить токен бота-секретаря для конкретной группы.
 *
 * Группа связана с записью `workspace_integrations` через
 * `project_telegram_chats.integration_id`. Если связь оборвана или у
 * интеграции пустой токен — кидаем ошибку. Env-fallback'а больше нет.
 */
export async function resolveBotToken(
  service: SupabaseClient,
  telegramChatId: number,
): Promise<ResolvedToken> {
  const { data: chat } = await service
    .from("project_telegram_chats")
    .select("integration_id, bot_version")
    .eq("telegram_chat_id", telegramChatId)
    .eq("is_active", true)
    .maybeSingle();

  if (!chat?.integration_id) {
    throw new Error(
      `[resolveBotToken] No integration_id for chat ${telegramChatId}. Group must be linked to a workspace bot integration.`,
    );
  }

  const resolved = await resolveTokenByIntegrationId(service, chat.integration_id);
  if (!resolved) {
    throw new Error(
      `[resolveBotToken] Integration ${chat.integration_id} not active or missing token.`,
    );
  }
  return resolved;
}
