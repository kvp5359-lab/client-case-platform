/**
 * Основной message-handler: маршрутизация по типу сообщения (команда / нажатие
 * кнопки меню / файл в активной сессии загрузки / обычное групповое сообщение)
 * и синхронизация в project_messages.
 *
 * Маршрутизатор работает поверх всех других модулей — здесь они склеиваются
 * под единый entry point из Deno.serve.
 */

import { service, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./shared.ts";
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
} from "../_shared/syncTelegramIncomingMessage.ts";
import type { TgMessage, TgChatBinding } from "./types.ts";

export async function handleMessage(msg: TgMessage, isEdited: boolean) {
  const chatId = msg.chat.id;
  const isPrivate = msg.chat.type === "private";
  const rawText = msg.text ?? msg.caption ?? "";

  // ── Команды (начинаются с "/") ──
  if (!isEdited && rawText.startsWith("/")) {
    await handleCommand(msg, rawText);
    return;
  }

  // ── Нажатие постоянной reply-кнопки «📋 Меню» ──
  if (!isEdited && rawText.trim() === MENU_REPLY_BUTTON_TEXT && msg.chat.type !== "private") {
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

  // В группе — файлы могут относиться к сценарию "жду файл для слота"
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

  // Обычная синхронизация сообщения в project_messages
  await syncGroupMessage(msg, binding, isEdited);
}

async function syncGroupMessage(msg: TgMessage, binding: TgChatBinding, isEdited: boolean) {
  const chatId = msg.chat.id;
  const telegramMessageId = msg.message_id;
  const rawText = msg.text ?? msg.caption ?? "";
  const entities = msg.entities ?? msg.caption_entities;
  const text = telegramEntitiesToHtml(rawText, entities);

  // Сервисные сообщения (вступил, вышел, переименовал...)
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
      asPersonalBot: null,
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
    asPersonalBot: null, // v2 webhook всегда секретарский
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

  const inserted = sync.rowId ? { id: sync.rowId } : null;
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

  if (inserted) {
    await downloadAttachments(msg, inserted.id, binding.workspace_id, binding.project_id);
  }
}

async function handlePrivateMessage(_msg: TgMessage) {
  // Пока — ничего. В личке работают только /start <token> и /help.
}
