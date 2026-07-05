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
 * Специальный маркер: ни один секретарь воркспейса не сидит в этой группе.
 * Edge functions ловят его и делают markMessageFailed с понятным reason
 * вместо общего 500.
 */
export const ERR_NO_SECRETARY_IN_GROUP = "NO_SECRETARY_IN_GROUP";

/**
 * Найти бот-секретарь, физически сидящий в группе. Для каждого активного
 * `telegram_workspace_bot` воркспейса дёргает Telegram getChat — тот, кто
 * получает ok=true, в группе. Возвращает первого найденного или null.
 *
 * Используется для self-healing привязки: если `project_telegram_chats.integration_id`
 * NULL (баг webhook'а /link, который не записывал integration_id), мы можем
 * автоматически восстановить связь. Также используется в /link для записи
 * правильного integration_id даже когда команду обработал не секретарь.
 */
export async function findSecretaryInGroup(
  service: SupabaseClient,
  telegramChatId: number,
  workspaceId: string,
): Promise<ResolvedToken | null> {
  const { data: bots } = await service
    .from("workspace_integrations")
    .select("id, is_active, config, secrets")
    .eq("workspace_id", workspaceId)
    .eq("type", "telegram_workspace_bot")
    .eq("is_active", true);
  if (!bots || bots.length === 0) return null;

  for (const bot of bots) {
    const token = (bot.secrets as { token?: string } | null)?.token;
    if (!token) continue;
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getChat?chat_id=${telegramChatId}`,
      );
      const data = await res.json();
      if (data?.ok === true) {
        const botVersion =
          (bot.config as { bot_version?: "v1" | "v2" } | null)?.bot_version === "v2"
            ? "v2"
            : "v1";
        return {
          token,
          integrationId: bot.id as string,
          senderType: "workspace_bot",
          botVersion,
        };
      }
    } catch (e) {
      console.warn(`[findSecretaryInGroup] getChat for bot ${bot.id} threw:`, e);
    }
  }
  return null;
}

/**
 * Получить токен бота-секретаря для конкретной группы.
 *
 * Логика:
 *  1. Если в `project_telegram_chats.integration_id` уже что-то стоит и
 *     интеграция жива — используем.
 *  2. Иначе (NULL или мёртвая интеграция) — self-healing: дёргаем Telegram
 *     getChat от каждого активного workspace_bot воркспейса, находим того,
 *     кто реально в группе, и записываем его в integration_id навсегда.
 *  3. Если ни один секретарь воркспейса не сидит в группе — кидаем ошибку
 *     с маркером `NO_SECRETARY_IN_GROUP`. Вызывающий edge function должен
 *     поймать её и сделать markMessageFailed с понятным reason.
 */
export async function resolveBotToken(
  service: SupabaseClient,
  telegramChatId: number,
): Promise<ResolvedToken> {
  const { data: chat } = await service
    .from("project_telegram_chats")
    .select("id, integration_id, workspace_id, bot_version")
    .eq("telegram_chat_id", telegramChatId)
    .eq("is_active", true)
    .maybeSingle();

  if (chat?.integration_id) {
    const resolved = await resolveTokenByIntegrationId(service, chat.integration_id);
    if (resolved) return resolved;
    // Integration деактивирована или удалена — провалимся в self-heal ниже.
    console.warn(
      `[resolveBotToken] integration ${chat.integration_id} dead, trying self-heal`,
    );
  }

  if (!chat?.workspace_id) {
    throw new Error(
      `[resolveBotToken] Chat ${telegramChatId} not registered in project_telegram_chats.`,
    );
  }

  const found = await findSecretaryInGroup(service, telegramChatId, chat.workspace_id);
  if (!found) {
    // Маркер ловится в telegram-send-message → markMessageFailed с осмысленным reason.
    throw new Error(
      `${ERR_NO_SECRETARY_IN_GROUP}: chat=${telegramChatId} workspace=${chat.workspace_id}`,
    );
  }

  // Self-heal: пропишем integration_id, чтобы при следующем вызове не дёргать TG API.
  await service
    .from("project_telegram_chats")
    .update({ integration_id: found.integrationId })
    .eq("id", chat.id);
  console.log(
    `[resolveBotToken] self-healed integration_id for chat ${telegramChatId}: ${found.integrationId}`,
  );

  return found;
}

/**
 * Признак рантайм-ошибки Telegram «бот физически не в группе» (кикнули /
 * группа не найдена / не участник). Отличается от ошибки прав или reply —
 * означает, что привязка `project_telegram_chats.integration_id` протухла и
 * надо искать другого живого секретаря. НЕ включаем «not enough rights»
 * (бот в группе, но без прав — rebind не поможет и может увести не туда).
 */
export function isBotNotInChatError(description?: string | null): boolean {
  if (!description) return false;
  const d = description.toLowerCase();
  return (
    d.includes("chat not found") ||
    d.includes("bot was kicked") ||
    d.includes("bot is not a member") ||
    d.includes("group chat was deactivated")
  );
}

/**
 * Реактивный self-heal привязки: текущий секретарь вернул «бот не в группе».
 * Ищем ДРУГОГО живого секретаря воркспейса, который реально сидит в группе
 * (getChat ok — кикнутого бота findSecretaryInGroup сам отсеет), переписываем
 * `project_telegram_chats.integration_id` и возвращаем его токен. null — если
 * ни один секретарь воркспейса больше не в группе.
 *
 * Вызывается из telegram-send-message при рантайм-фейле отправки, в дополнение
 * к DB-level self-heal внутри resolveBotToken (тот лечит только NULL/мёртвую
 * интеграцию, но не «бот жив в БД, но кикнут из группы»).
 */
export async function rebindSecretaryInGroup(
  service: SupabaseClient,
  telegramChatId: number,
): Promise<ResolvedToken | null> {
  const { data: chat } = await service
    .from("project_telegram_chats")
    .select("id, workspace_id, integration_id")
    .eq("telegram_chat_id", telegramChatId)
    .eq("is_active", true)
    .maybeSingle();
  if (!chat?.workspace_id) return null;

  const found = await findSecretaryInGroup(service, telegramChatId, chat.workspace_id);
  if (!found) return null;
  // Тот же бот, что уже привязан, снова прошёл getChat — значит он в группе, а
  // фейл был не про членство. Rebind не нужен (и не должен зациклить повтор).
  if (found.integrationId === chat.integration_id) return null;

  await service
    .from("project_telegram_chats")
    .update({ integration_id: found.integrationId })
    .eq("id", chat.id);
  console.log(
    `[rebindSecretaryInGroup] healed binding for chat ${telegramChatId}: ${chat.integration_id ?? "null"} -> ${found.integrationId}`,
  );
  return found;
}

/**
 * Для webhook'а /link: определить какой integration_id записать в
 * project_telegram_chats при подключении группы.
 *
 *  - Если /link обрабатывает сам секретарь → его id.
 *  - Если /link обрабатывает личный бот сотрудника → ищем секретаря в группе
 *    среди workspace_bot'ов воркспейса, возвращаем его id (даже если /link
 *    обработал другой бот). Это правильное состояние: integration_id всегда
 *    указывает на секретаря, fallback идёт туда.
 *  - Если секретарь не в группе и /link обработал не секретарь → NULL. UI
 *    покажет баннер «в группе нет секретаря».
 */
export async function determineIntegrationIdForLink(
  service: SupabaseClient,
  telegramChatId: number,
  workspaceId: string,
  currentBotToken: string,
): Promise<string | null> {
  const { data: allBots } = await service
    .from("workspace_integrations")
    .select("id, type, secrets, is_active")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .in("type", ["telegram_workspace_bot", "telegram_employee_bot"]);

  const currentBot = allBots?.find(
    (b) => (b.secrets as { token?: string } | null)?.token === currentBotToken,
  );

  if (currentBot?.type === "telegram_workspace_bot") {
    return currentBot.id as string;
  }

  // Команду обработал личный бот (или бот воркспейса, но не secretary) —
  // ищем секретаря в группе через TG API.
  const secretary = await findSecretaryInGroup(service, telegramChatId, workspaceId);
  return secretary?.integrationId ?? null;
}
