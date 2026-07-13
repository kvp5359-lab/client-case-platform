/**
 * Edge Function: telegram-webhook-v2
 *
 * Новый Telegram-бот (@rs2_support_bot). Работает только с группами, у которых
 * `project_telegram_chats.bot_version = 'v2'`. Старые группы (v1) обслуживает
 * исходная функция telegram-webhook — она не трогается.
 *
 * Что умеет:
 *  1) Синхронизация сообщений, реакций, вложений, сервисных сообщений, правок —
 *     полностью как старый бот (логика скопирована, расширена фильтром v2).
 *  2) Команды:
 *     - /link КОД        — привязать группу к треду по link_code (bot_version='v2')
 *     - /unlink          — отвязать группу
 *     - /start           — в группе: хелп; в личке: если передан deep-link токен —
 *                          склейка Telegram-аккаунта с participant
 *     - /menu            — главное inline-меню (знания, загрузка)
 *     - /knowledge       — сразу меню знаний
 *     - /upload          — сразу список пустых слотов проекта
 *  3) Callback-queries (нажатия inline-кнопок) — навигация по базе знаний,
 *     выбор слота для загрузки.
 *  4) Многошаговые сценарии через таблицу telegram_bot_sessions
 *     (например: выбрал слот → ждёт файл).
 *
 * Этот файл — тонкий entry point. Вся логика разбита по модулям:
 *  - shared.ts          — service, BOT_TOKEN, SUPABASE_URL/KEY
 *  - types.ts           — типы Telegram API
 *  - pure.ts            — чистые helpers (форматирование, парсинг)
 *  - tg-api.ts          — sendMessage/editMessage/answerCallback/tgCall
 *  - bindings.ts        — findChatBinding (group ↔ project)
 *  - participants.ts    — participantByTgId, findOrCreateParticipant
 *  - media.ts           — fetchTelegramFile, downloadAttachments
 *  - session.ts         — telegram_bot_sessions CRUD
 *  - knowledge.ts       — showKbGroups, showArticle, resolvePrefixId, logServiceEvent
 *  - commands.ts        — handleCommand (/start, /menu, etc), showMainMenu, showFolderInfo
 *  - upload-slot.ts     — загрузка документов (showUpload*, handleSlotFileUpload, ...)
 *  - callbacks.ts       — handleCallback (маршрутизатор inline-кнопок)
 *  - sync.ts            — handleMessage + syncGroupMessage (entry для message updates)
 *  - callback-data.ts   — encode/decode callback_data (короткий формат)
 *  - tiptap.ts          — рендер статей knowledge_base в Telegram-HTML
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  syncTelegramReactions,
  syncTelegramReactionsAggregated,
} from "../_shared/syncTelegramReactions.ts";
import { service, setBotToken, runWithBotToken } from "./shared.ts";
import { handleMessage } from "./sync.ts";
import { handleCallback } from "./callbacks.ts";
import type { IntegrationContext } from "./types.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Авторизация: secret_token = id записи workspace_integrations
  // (того, кто настроил webhook через telegram-register-webhook).
  // Подтягиваем оттуда же токен бота — env-переменных больше нет.
  //
  // Принимаем оба типа: telegram_workspace_bot (секретарь, полный функционал)
  // и telegram_employee_bot (личный бот сотрудника, только приём + dedup +
  // реакции + edit). Различение делается через IntegrationContext.mode и
  // прокидывается во все нижние модули — см. types.ts → IntegrationContext.
  const headerSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!headerSecret) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { data: integration } = await service
    .from("workspace_integrations")
    .select("id, type, workspace_id, is_active, config, secrets")
    .eq("id", headerSecret)
    .maybeSingle();
  if (
    !integration ||
    integration.is_active === false ||
    (integration.type !== "telegram_workspace_bot" &&
      integration.type !== "telegram_employee_bot" &&
      integration.type !== "telegram_lead_bot")
  ) {
    return new Response("Unauthorized", { status: 401 });
  }
  const tokenFromDb = (integration.secrets as { token?: string } | null)?.token;
  if (!tokenFromDb) {
    return new Response("Server misconfigured", { status: 500 });
  }
  setBotToken(tokenFromDb);

  const ctx: IntegrationContext = {
    id: integration.id as string,
    workspaceId: integration.workspace_id as string,
    botId:
      ((integration.config as { bot_id?: number } | null)?.bot_id as
        | number
        | undefined) ?? null,
    mode:
      integration.type === "telegram_workspace_bot"
        ? "workspace"
        : integration.type === "telegram_lead_bot"
          ? "lead"
          : "employee",
    // Токен этого запроса — для скачивания вложений в обход гонки глобали
    // (см. IntegrationContext.botToken / media.ts).
    botToken: tokenFromDb,
  };

  // Вся обработка — внутри request-scoped ALS-контекста с токеном этого бота,
  // чтобы параллельный webhook другого бота той же группы не перетёр токен
  // (гонка G10). getBotToken() внутри любого tgCall берёт токен отсюда.
  return await runWithBotToken(tokenFromDb, async () => {
    try {
      const update = await req.json();

      if (update.callback_query) {
        await handleCallback(update.callback_query, ctx);
      } else if (update.message_reaction) {
        await syncTelegramReactions(service, update.message_reaction);
      } else if (update.message_reaction_count) {
        // Premium-юзер с мульти-реакцией / анонимный админ → приходит
        // агрегатный count-update без user info. Пишем как «anonymous».
        await syncTelegramReactionsAggregated(service, update.message_reaction_count);
      } else if (update.edited_message) {
        await handleMessage(update.edited_message, true, ctx);
      } else if (update.message) {
        await handleMessage(update.message, false, ctx);
      }
    } catch (err) {
      // Возвращаем 500, чтобы Telegram повторил доставку. Дедуп защищает от
      // двойной вставки при ретраях (uq_project_messages_telegram_dedup).
      console.error("telegram-webhook-v2 error:", err);
      return new Response("error", { status: 500 });
    }

    return new Response("ok", { status: 200 });
  });
});
