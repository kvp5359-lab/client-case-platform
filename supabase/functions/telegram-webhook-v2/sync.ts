/**
 * Основной message-handler: маршрутизация по типу сообщения (команда / нажатие
 * кнопки меню / файл в активной сессии загрузки / обычное групповое сообщение)
 * и синхронизация в project_messages.
 *
 * Маршрутизатор работает поверх всех других модулей — здесь они склеиваются
 * под единый entry point из Deno.serve.
 */

import { service, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BOT_VERSION } from "./shared.ts";
import { findChatBinding } from "./bindings.ts";
import { findOrCreateParticipant } from "./participants.ts";
import { downloadAttachments } from "./media.ts";
import { getSession } from "./session.ts";
import { handleCommand, showMainMenu } from "./commands.ts";
import {
  handleSlotFileUpload,
  handleFreeFileUpload,
} from "./upload-slot.ts";
import {
  formatUserName,
  getServiceMessageText,
  extractForward,
  MENU_REPLY_BUTTON_TEXT,
} from "./pure.ts";
import { telegramEntitiesToHtml } from "../_shared/telegramEntitiesToHtml.ts";
import {
  syncTelegramIncomingMessage,
  applyTelegramEdit,
  type PersonalBotContext,
} from "../_shared/syncTelegramIncomingMessage.ts";
import type { IntegrationContext, TgMessage, TgChatBinding } from "./types.ts";

/**
 * Контекст личного бота для multi-bot dedup и роутинга reply-lookup в counter
 * того же бота. Для секретаря (workspace_bot) — null: записанная строка
 * считается «секретарской» и может быть enriched личным ботом по 23505.
 */
function buildPersonalBotContext(ctx: IntegrationContext): PersonalBotContext | null {
  if (ctx.mode === "workspace") return null;
  return {
    integrationId: ctx.id,
    workspaceId: ctx.workspaceId,
    botId: ctx.botId,
  };
}

export async function handleMessage(msg: TgMessage, isEdited: boolean, ctx: IntegrationContext) {
  const chatId = msg.chat.id;
  const isPrivate = msg.chat.type === "private";
  const rawText = msg.text ?? msg.caption ?? "";

  // ── Команды (начинаются с "/") ──
  if (!isEdited && rawText.startsWith("/")) {
    await handleCommand(msg, rawText, ctx);
    return;
  }

  // ── Нажатие постоянной reply-кнопки «📋 Меню» ──
  // Только workspace-бот показывает эту клавиатуру; у employee её не бывает.
  if (
    !isEdited &&
    ctx.mode === "workspace" &&
    rawText.trim() === MENU_REPLY_BUTTON_TEXT &&
    msg.chat.type !== "private"
  ) {
    await showMainMenu(chatId);
    return;
  }

  // ── Личный чат: проверяем, может это файл для awaiting_file сессии? ──
  if (isPrivate) {
    await handlePrivateMessage(msg);
    return;
  }

  // ── Группа: проверяем привязку v2 ──
  const binding = await findChatBinding(chatId);
  if (!binding) return; // либо не наша группа, либо обслуживается v1

  // В группе — файлы могут относиться к сценарию "жду файл для слота".
  // Сессии существуют только у workspace_bot; у employee — никогда (команды
  // /upload/menu в employee mode молчат, awaiting_file не возникнет).
  if (ctx.mode === "workspace") {
    const hasFile = !!(msg.document || msg.photo || msg.video || msg.voice || msg.audio);
    if (hasFile && msg.from) {
      const session = await getSession(chatId, msg.from.id);
      if (session?.state === "awaiting_file" && session.context.slot_id) {
        await handleSlotFileUpload(msg, binding, session.context.slot_id as string);
        return;
      }
      if (session?.state === "awaiting_free_file") {
        await handleFreeFileUpload(msg, binding);
        return;
      }
    }
  }

  // Обычная синхронизация сообщения в project_messages
  await syncGroupMessage(msg, binding, isEdited, ctx);
}

async function syncGroupMessage(
  msg: TgMessage,
  binding: TgChatBinding,
  isEdited: boolean,
  ctx: IntegrationContext,
) {
  const chatId = msg.chat.id;
  const telegramMessageId = msg.message_id;
  const rawText = msg.text ?? msg.caption ?? "";
  const entities = msg.entities ?? msg.caption_entities;
  const text = telegramEntitiesToHtml(rawText, entities);
  const asPersonalBot = buildPersonalBotContext(ctx);

  // Group → supergroup: chat_id меняется. Telegram шлёт это сообщение по
  // старому chat_id, новые апдейты пойдут по новому. Переписываем binding
  // ДО записи сервисного сообщения, чтобы следующий update нашёл тред.
  // findChatBinding по старому id ещё работает (мы внутри его результата),
  // но фильтр UPDATE по old chat_id всё равно зацепит ровно одну строку.
  if (msg.migrate_to_chat_id) {
    await service
      .from("project_telegram_chats")
      .update({ telegram_chat_id: msg.migrate_to_chat_id })
      .eq("telegram_chat_id", chatId)
      .eq("bot_version", BOT_VERSION);
  }

  // Сервисные сообщения (вступил, вышел, переименовал, migrate_to_chat_id...)
  const serviceText = getServiceMessageText(msg);
  if (serviceText) {
    await service.from("project_messages").insert({
      project_id: binding.project_id,
      workspace_id: binding.workspace_id,
      sender_participant_id: null,
      sender_name: "Telegram",
      sender_role: null,
      content: serviceText,
      source: "telegram_service",
      channel: binding.channel || "client",
      thread_id: binding.thread_id ?? undefined,
      telegram_message_id: telegramMessageId,
      telegram_chat_id: chatId,
    });
    return;
  }

  // Правка существующего сообщения
  if (isEdited) {
    await applyTelegramEdit(service, {
      chatId,
      telegramMessageId,
      newContent: text || rawText,
      asPersonalBot,
    });
    return;
  }

  // Новый/существующий participant по telegram_user_id
  const senderParticipantId = msg.from
    ? await findOrCreateParticipant(binding.workspace_id, msg.from)
    : null;

  // Используем общий хелпер дедупа/вставки. Там — атомарный INSERT с
  // unique-индексом по (chat, sender_user_id, message_date) +
  // догоняющий enrich, если другой webhook успел вставить первым.
  const forward = extractForward(msg);

  const sync = await syncTelegramIncomingMessage(service, {
    message: msg,
    binding,
    text,
    senderName: formatUserName(msg.from),
    senderParticipantId,
    forwardInfo: forward,
    asPersonalBot,
  });

  // Fire-and-forget: фоновый кэш аватара отправителя (кэш-функция дедуплицирует).
  if (msg.from?.id && !msg.from.is_bot) {
    fetch(`${SUPABASE_URL}/functions/v1/fetch-telegram-avatar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ tg_user_id: msg.from.id }),
    }).catch(() => {});
  }

  if (sync.outcome === "duplicate") {
    console.warn(
      "[telegram-webhook-v2] message dropped as duplicate",
      JSON.stringify({
        chat_id: chatId,
        telegram_message_id: telegramMessageId,
        sender_user_id: msg.from?.id ?? null,
        message_date: msg.date ?? null,
      }),
    );
  } else if (sync.outcome === "error") {
    console.error("[telegram-webhook-v2] sync failed:", sync.error);
  }

  // Качаем вложения только при настоящем INSERT. На `enriched` (employee
  // пришёл вторым после secretary) первый webhook уже скачал/начал качать
  // файл — повторный upload с upsert:false упадёт с 23505 «resource already
  // exists» и затрёт attachment_status, хотя файл реально загружен. На
  // `duplicate` (secretary вторым) sync.rowId уже null, downloadAttachments
  // и так бы не запустился.
  if (sync.outcome === "inserted" && sync.rowId) {
    await downloadAttachments(msg, sync.rowId, binding.workspace_id, binding.project_id);
  }
}

async function handlePrivateMessage(_msg: TgMessage) {
  // Пока — ничего. В личке работают только /start <token> и /help.
}
