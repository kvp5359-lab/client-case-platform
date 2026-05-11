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
import { service, setBotToken } from "./shared.ts";
import { handleMessage } from "./sync.ts";
import { handleCallback } from "./callbacks.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Авторизация: secret_token = id записи workspace_integrations
  // (того, кто настроил webhook через telegram-register-webhook).
  // Подтягиваем оттуда же токен бота — env-переменных больше нет.
  const headerSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!headerSecret) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { data: integration } = await service
    .from("workspace_integrations")
    .select("id, type, is_active, config, secrets")
    .eq("id", headerSecret)
    .maybeSingle();
  if (
    !integration ||
    integration.is_active === false ||
    integration.type !== "telegram_workspace_bot"
  ) {
    return new Response("Unauthorized", { status: 401 });
  }
  const tokenFromDb = (integration.secrets as { token?: string } | null)?.token;
  if (!tokenFromDb) {
    return new Response("Server misconfigured", { status: 500 });
  }
  setBotToken(tokenFromDb);

  try {
    const update = await req.json();

    // DEBUG: видеть какие update-типы реально присылает Telegram —
    // нужно для отладки реакций на media-group (см. в БД отсутствие
    // message_reaction для альбома, хотя на текст реакции прилетают).
    console.log(JSON.stringify({
      sub: "telegram-webhook-v2",
      event: "update.received",
      update_keys: Object.keys(update),
      update_id: update.update_id,
      reaction_message_id: update.message_reaction?.message_id ?? update.message_reaction_count?.message_id ?? null,
      reaction_chat_id: update.message_reaction?.chat?.id ?? update.message_reaction_count?.chat?.id ?? null,
      reaction_count_summary: update.message_reaction_count
        ? { reactions: update.message_reaction_count.reactions }
        : null,
    }));

    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message_reaction) {
      await syncTelegramReactions(service, update.message_reaction);
    } else if (update.message_reaction_count) {
      // Premium-юзер с мульти-реакцией / анонимный админ → приходит
      // агрегатный count-update без user info. Пишем как «anonymous».
      await syncTelegramReactionsAggregated(service, update.message_reaction_count);
    } else if (update.edited_message) {
      await handleMessage(update.edited_message, true);
    } else if (update.message) {
      await handleMessage(update.message, false);
    }
  } catch (err) {
    console.error("telegram-webhook-v2 error:", err);
  }

  // Telegram всегда ждёт 200 — иначе начнёт ретраить
  return new Response("ok", { status: 200 });
});
