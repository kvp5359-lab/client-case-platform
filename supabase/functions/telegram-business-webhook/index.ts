/**
 * Edge Function: telegram-business-webhook
 *
 * Webhook для общего бота сервиса @clientcase_bot, через который
 * сотрудники подключают свой Telegram Business. Обрабатывает:
 *  - /start biz_<token>      — привязка tg_user_id ↔ user_id (шаг 1).
 *  - business_connection      — апдейт о подключении/отключении бота
 *                               сотрудником через Settings → Business → Chatbots.
 *  - business_message         — личное сообщение клиенту/от клиента.
 *                               Короткие эмодзи-only reply от клиента
 *                               детектируются как реакции и пишутся в
 *                               message_reactions (см. _shared/syncBusinessEmojiReaction).
 *  - edited_business_message  — редактирование сообщения.
 *  - deleted_business_messages — удаление business-сообщений; сейчас
 *                               используем только для снятия реакций
 *                               (когда клиент убирает реакцию в Telegram).
 *  - message_reaction         — реакции в личных диалогах (Bot API НЕ шлёт
 *                               их для 1-на-1 Business; код страховочно
 *                               готов на будущее).
 *
 * Сохранение сообщения и реакций — через общие хелперы в `_shared/`,
 * чтобы не дублировать дедуп / reply-lookup из обычного webhook'а.
 *
 * Auth: webhook вызывается Telegram'ом без JWT, поэтому функция должна
 * быть задеплоена с --no-verify-jwt. Защита от чужих запросов — через
 * заголовок X-Telegram-Bot-Api-Secret-Token, значение совпадает с
 * env-переменной TELEGRAM_BUSINESS_WEBHOOK_SECRET.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  syncTelegramIncomingMessage,
  applyTelegramEdit,
  type ChatBinding,
} from "../_shared/syncTelegramIncomingMessage.ts";
import { syncTelegramReactions } from "../_shared/syncTelegramReactions.ts";
import {
  maybeSyncBusinessEmojiReaction,
  deleteBusinessReactionsByMessageIds,
} from "../_shared/syncBusinessEmojiReaction.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUSINESS_BOT_TOKEN = Deno.env.get("TELEGRAM_BUSINESS_BOT_TOKEN")!;
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_BUSINESS_WEBHOOK_SECRET") ?? "";

interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TgChat {
  id: number;
  type: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  caption?: string;
  business_connection_id?: string;
  reply_to_message?: { message_id: number };
}

interface TgBusinessConnection {
  id: string;
  user: TgUser;
  user_chat_id: number;
  date: number;
  rights?: { can_reply?: boolean };
  is_enabled: boolean;
}

interface TgReactionType {
  type: "emoji" | "custom_emoji" | "paid";
  emoji?: string;
  custom_emoji_id?: string;
}

interface TgMessageReaction {
  chat: TgChat;
  message_id: number;
  user?: TgUser;
  date: number;
  old_reaction: TgReactionType[];
  new_reaction: TgReactionType[];
  business_connection_id?: string;
}

interface TgBusinessMessagesDeleted {
  business_connection_id: string;
  chat: TgChat;
  message_ids: number[];
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  business_connection?: TgBusinessConnection;
  business_message?: TgMessage;
  edited_business_message?: TgMessage;
  deleted_business_messages?: TgBusinessMessagesDeleted;
  message_reaction?: TgMessageReaction;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  if (WEBHOOK_SECRET) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== WEBHOOK_SECRET) {
      console.warn("[telegram-business-webhook] secret mismatch");
      return new Response("forbidden", { status: 403 });
    }
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return new Response("ok", { status: 200 });
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (update.business_connection) {
      await handleBusinessConnection(service, update.business_connection);
    } else if (update.business_message) {
      await handleBusinessMessage(service, update.business_message, false);
    } else if (update.edited_business_message) {
      await handleBusinessMessage(service, update.edited_business_message, true);
    } else if (update.deleted_business_messages) {
      // Удаление business-сообщений. Сейчас задействуем только для снятия
      // эмодзи-реакций: если клиент удалил своё короткое эмодзи-сообщение
      // в Telegram — реакция должна пропасть и у нас. Удаление обычных
      // business-сообщений (soft-delete в project_messages) пока не делаем.
      await deleteBusinessReactionsByMessageIds(
        service,
        update.deleted_business_messages.message_ids,
      );
    } else if (update.message_reaction) {
      // Общий хелпер сам не различает business / group — поиск идёт по
      // (telegram_chat_id, telegram_message_ids contains). Сейчас Bot API
      // НЕ шлёт эти update'ы для 1-на-1 Business — но если когда-нибудь
      // включит, обработка готова.
      await syncTelegramReactions(service, update.message_reaction);
    } else if (update.message) {
      await handlePrivateMessage(service, update.message);
    }
  } catch (err) {
    console.error("[telegram-business-webhook] handler error:", err);
  }

  return new Response("ok", { status: 200 });
});

// ===========================================================================
// /start biz_<token> — привязка tg_user_id к user_id сотрудника
// ===========================================================================

async function handlePrivateMessage(
  service: SupabaseClient,
  msg: TgMessage,
): Promise<void> {
  if (!msg.from || msg.chat.type !== "private") return;
  const text = msg.text || "";
  const startMatch = text.match(/^\/start\s+biz_([0-9a-f-]{36})/i);
  if (!startMatch) {
    await sendTelegramMessage(msg.chat.id, [
      "Привет! Я бот сервиса ClientCase для подключения Telegram Business.",
      "",
      "Чтобы подключить — зайди в настройках сервиса:",
      "Настройки воркспейса → Интеграции → Telegram Business → Подключить.",
    ].join("\n"));
    return;
  }

  const token = startMatch[1];
  const { data: tokenRow } = await service
    .from("telegram_business_link_tokens")
    .select("token, user_id, workspace_id, expires_at, consumed_at")
    .eq("token", token)
    .maybeSingle();

  if (!tokenRow) {
    await sendTelegramMessage(msg.chat.id, "❌ Ссылка недействительна. Попробуй сгенерировать новую в настройках сервиса.");
    return;
  }
  if (tokenRow.consumed_at) {
    await sendTelegramMessage(msg.chat.id, "⚠️ Эта ссылка уже была использована. Если нужно перепривязать — сгенерируй новую.");
    return;
  }
  if (new Date(tokenRow.expires_at) < new Date()) {
    await sendTelegramMessage(msg.chat.id, "⏱ Ссылка устарела. Сгенерируй новую в настройках сервиса.");
    return;
  }

  await service
    .from("telegram_business_link_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token", token);

  const { error: linkErr } = await service
    .from("user_telegram_links")
    .upsert({
      user_id: tokenRow.user_id,
      tg_user_id: msg.from.id,
      tg_username: msg.from.username ?? null,
      tg_first_name: msg.from.first_name ?? null,
      tg_last_name: msg.from.last_name ?? null,
      linked_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (linkErr) {
    console.error("[telegram-business-webhook] link upsert error:", linkErr);
    if (linkErr.code === "23505") {
      await sendTelegramMessage(msg.chat.id, "❌ Этот Telegram-аккаунт уже привязан к другому пользователю сервиса. Обратись к администратору.");
      return;
    }
    await sendTelegramMessage(msg.chat.id, "❌ Не удалось сохранить привязку. Попробуй позже или обратись к администратору.");
    return;
  }

  await sendTelegramMessage(msg.chat.id, [
    "✅ Аккаунт привязан!",
    "",
    "Теперь подключи бота как делегата своего Business-аккаунта:",
    "1. Settings → Telegram for Business → Chatbots",
    `2. Введи имя бота: @${(await getBotUsername()) || "clientcase_bot"}`,
    "3. Включи права отвечать на сообщения",
    "",
    "После этого все твои личные диалоги начнут синхронизироваться в сервис.",
  ].join("\n"));
}

// ===========================================================================
// business_connection — подключение/отключение бота сотрудником
// ===========================================================================

async function handleBusinessConnection(
  service: SupabaseClient,
  bc: TgBusinessConnection,
): Promise<void> {
  const { data: link } = await service
    .from("user_telegram_links")
    .select("user_id")
    .eq("tg_user_id", bc.user.id)
    .maybeSingle();

  if (!link) {
    console.warn(
      `[telegram-business-webhook] business_connection from unlinked tg_user_id=${bc.user.id} (${bc.user.username || bc.user.first_name}).`,
    );
    if (bc.user_chat_id) {
      await sendTelegramMessage(
        bc.user_chat_id,
        "⚠️ Ты подключил меня в Business-настройках, но твой Telegram-аккаунт ещё не привязан к ClientCase. Зайди в настройки сервиса → Интеграции → Telegram Business → Подключить, и используй сгенерированную ссылку.",
      );
    }
    return;
  }

  const { data: participant } = await service
    .from("participants")
    .select("workspace_id")
    .eq("user_id", link.user_id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!participant) {
    console.warn(`[telegram-business-webhook] no workspace for user_id=${link.user_id}`);
    return;
  }

  await service
    .from("telegram_business_connections")
    .upsert({
      business_connection_id: bc.id,
      user_id: link.user_id,
      workspace_id: participant.workspace_id,
      tg_user_id: bc.user.id,
      tg_username: bc.user.username ?? null,
      tg_first_name: bc.user.first_name ?? null,
      tg_last_name: bc.user.last_name ?? null,
      is_enabled: bc.is_enabled,
      can_reply: bc.rights?.can_reply ?? false,
      connected_at: new Date(bc.date * 1000).toISOString(),
      disconnected_at: bc.is_enabled ? null : new Date().toISOString(),
    }, { onConflict: "business_connection_id" });

  if (bc.user_chat_id) {
    if (bc.is_enabled) {
      await sendTelegramMessage(
        bc.user_chat_id,
        bc.rights?.can_reply
          ? "✅ Telegram Business подключён. Теперь все твои личные диалоги синхронизируются в ClientCase, и ответы из сервиса будут уходить от твоего имени."
          : "✅ Telegram Business подключён, но без права отвечать. Сообщения будут приходить в сервис только в режиме чтения. Чтобы отвечать из ClientCase — включи в Business-настройках право «Reply to messages».",
      );
    } else {
      await sendTelegramMessage(
        bc.user_chat_id,
        "Telegram Business отключён. Новые сообщения больше не будут приходить в ClientCase.",
      );
    }
  }
}

// ===========================================================================
// business_message — личное сообщение клиенту/от клиента
// ===========================================================================

async function handleBusinessMessage(
  service: SupabaseClient,
  msg: TgMessage,
  isEdit: boolean,
): Promise<void> {
  const bcId = msg.business_connection_id;
  if (!bcId || !msg.from) return;

  const { data: conn } = await service
    .from("telegram_business_connections")
    .select("id, user_id, workspace_id, tg_user_id")
    .eq("business_connection_id", bcId)
    .maybeSingle();
  if (!conn) {
    console.warn(`[telegram-business-webhook] unknown business_connection_id=${bcId}`);
    return;
  }

  const isOutgoingFromEmployee = msg.from.id === conn.tg_user_id;
  const clientTgUserId = isOutgoingFromEmployee ? msg.chat.id : msg.from.id;
  const clientFirstName = isOutgoingFromEmployee
    ? msg.chat.first_name ?? null
    : msg.from.first_name ?? null;
  const clientLastName = isOutgoingFromEmployee
    ? msg.chat.last_name ?? null
    : msg.from.last_name ?? null;
  const clientUsername = isOutgoingFromEmployee
    ? msg.chat.username ?? null
    : msg.from.username ?? null;

  const clientDisplayName =
    [clientFirstName, clientLastName].filter(Boolean).join(" ") ||
    (clientUsername ? `@${clientUsername}` : `tg:${clientTgUserId}`);

  // Сначала ищем существующий тред по (business_connection, client_tg_user_id) —
  // если уже общались, попадём именно в этот тред (даже если первое сообщение
  // было от сотрудника или CRM-роутинг отключён).
  let projectId: string
  let threadId: string
  const { data: existingThread } = await service
    .from("project_threads")
    .select("id, project_id")
    .eq("business_connection_id", conn.id)
    .eq("business_client_tg_user_id", clientTgUserId)
    .eq("is_deleted", false)
    .maybeSingle()

  if (existingThread) {
    projectId = existingThread.project_id as string
    threadId = existingThread.id as string
  } else if (!isOutgoingFromEmployee) {
    // Этап 9 CRM-фрейма: если это первое сообщение от клиента — пробуем
    // маршрутизацию через CRM. Сотрудник пишет первым → fallback в системный
    // инбокс (как было раньше): не понимаем, кому это «лид».
    const { data: routed } = await service.rpc("route_incoming_to_project", {
      p_workspace_id: conn.workspace_id,
      p_source: "telegram_business",
      p_channel_type: "telegram",
      p_external_id: String(clientTgUserId),
      p_sender_name: clientDisplayName,
      p_thread_name: clientDisplayName,
    })
    const r = Array.isArray(routed) ? routed[0] : routed
    if (r?.project_id && r?.thread_id) {
      projectId = r.project_id as string
      threadId = r.thread_id as string
      // Дописываем business-метаданные в свежесозданный тред — чтобы
      // следующие сообщения этого диалога находились этим же запросом.
      await service.from("project_threads").update({
        business_connection_id: conn.id,
        business_client_tg_user_id: clientTgUserId,
        icon: "telegram",
        accent_color: "blue",
      }).eq("id", threadId)
      console.log(`[telegram-business-webhook] CRM routed (${r.status}) → project ${projectId}, thread ${threadId}`)
    } else {
      // 'no_template' или другая причина — фоллбэк в системный инбокс.
      projectId = await ensureSystemInboxProject(service, conn.user_id, conn.workspace_id)
      threadId = await ensureBusinessThread(
        service, projectId, conn.workspace_id, conn.id, clientTgUserId, clientDisplayName,
      )
    }
  } else {
    // Сотрудник пишет впервые из телефона — нет смысла создавать лида,
    // системный инбокс это его «черновик».
    projectId = await ensureSystemInboxProject(service, conn.user_id, conn.workspace_id)
    threadId = await ensureBusinessThread(
      service, projectId, conn.workspace_id, conn.id, clientTgUserId, clientDisplayName,
    )
  }

  const content = msg.text ?? msg.caption ?? "";

  // Детектор реакции: если клиент шлёт короткий эмодзи-only reply на наше
  // сообщение — это с большой вероятностью реакция (Bot API не отдаёт
  // нативные `message_reaction` updates для 1-на-1 Business). Конвертируем
  // в запись в `message_reactions` и НЕ вставляем в ленту.
  // Edit-сообщения и исходящие от сотрудника пропускаем — там не реакции.
  if (!isEdit && !isOutgoingFromEmployee) {
    const reactionResult = await maybeSyncBusinessEmojiReaction(service, {
      msg,
      projectId,
      workspaceId: conn.workspace_id,
    });
    if (reactionResult.consumed) return;
  }

  // EDIT: общий хелпер ищет строку и в counter того же бота, и в массиве IDs.
  if (isEdit) {
    await applyTelegramEdit(service, {
      chatId: msg.chat.id,
      telegramMessageId: msg.message_id,
      newContent: content,
      asPersonalBot: null,
    });
    return;
  }

  // Outgoing-ветка: сотрудник написал из своего телефона. Привязываем к
  // его participant_id, sender_role/name берёт UI из participant'а.
  let senderParticipantId: string | null = null;
  if (isOutgoingFromEmployee) {
    const { data: participant } = await service
      .from("participants")
      .select("id")
      .eq("user_id", conn.user_id)
      .eq("workspace_id", conn.workspace_id)
      .eq("is_deleted", false)
      .maybeSingle();
    if (participant) senderParticipantId = participant.id as string;
  }

  // Общий sync-хелпер: дедуп, reply-lookup, инсёрт. asPersonalBot=null —
  // в Business у нас один общий бот, integration_id не используется,
  // дедуп держит UNIQUE-индекс по (chat, sender, date).
  await syncTelegramIncomingMessage(service, {
    message: {
      message_id: msg.message_id,
      chat: { id: msg.chat.id },
      date: msg.date,
      from: msg.from
        ? { id: msg.from.id, first_name: msg.from.first_name, last_name: msg.from.last_name }
        : undefined,
      reply_to_message: msg.reply_to_message,
    },
    binding: {
      project_id: projectId,
      workspace_id: conn.workspace_id,
      channel: "client",
      thread_id: threadId,
    } satisfies ChatBinding,
    text: content,
    senderName: isOutgoingFromEmployee ? "" : clientDisplayName,
    senderParticipantId,
    forwardInfo: { name: null, date: null },
    asPersonalBot: null,
    source: "telegram_business",
    senderRole: isOutgoingFromEmployee ? null : "Клиент",
  });
}

// ===========================================================================
// Helpers: системный инбокс-проект и Business-тред
// ===========================================================================

async function ensureSystemInboxProject(
  service: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<string> {
  const { data: existing } = await service
    .from("projects")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("system_inbox_user_id", userId)
    .eq("system_inbox_kind", "telegram_business")
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await service
    .from("projects")
    .insert({
      workspace_id: workspaceId,
      name: "Личные диалоги Telegram",
      description: "Системный проект: личные диалоги сотрудника через Telegram Business.",
      system_inbox_kind: "telegram_business",
      system_inbox_user_id: userId,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(`Failed to create system inbox: ${error?.message}`);
  }

  // Добавляем владельца как Администратора в project_participants — иначе
  // get_workspace_threads (без view_all_projects) не отдаст ему треды
  // собственного инбокса.
  const { data: ownerParticipant } = await service
    .from("participants")
    .select("id")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (ownerParticipant) {
    await service.from("project_participants").insert({
      project_id: created.id,
      participant_id: ownerParticipant.id,
      project_roles: ["Администратор"],
    });
  }

  return created.id;
}

async function ensureBusinessThread(
  service: SupabaseClient,
  projectId: string,
  workspaceId: string,
  connectionId: string,
  clientTgUserId: number,
  clientDisplayName: string,
): Promise<string> {
  const { data: existing } = await service
    .from("project_threads")
    .select("id")
    .eq("business_connection_id", connectionId)
    .eq("business_client_tg_user_id", clientTgUserId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await service
    .from("project_threads")
    .insert({
      project_id: projectId,
      workspace_id: workspaceId,
      name: clientDisplayName,
      type: "chat",
      access_type: "all",
      business_connection_id: connectionId,
      business_client_tg_user_id: clientTgUserId,
      icon: "telegram",
      accent_color: "blue",
    })
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(`Failed to create business thread: ${error?.message}`);
  }
  return created.id;
}

// ===========================================================================
// Telegram API helpers
// ===========================================================================

let cachedBotUsername: string | null = null;
async function getBotUsername(): Promise<string | null> {
  if (cachedBotUsername) return cachedBotUsername;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BUSINESS_BOT_TOKEN}/getMe`);
    const json = (await res.json()) as { ok: boolean; result?: { username?: string } };
    if (json.ok && json.result?.username) {
      cachedBotUsername = json.result.username;
      return cachedBotUsername;
    }
  } catch (_) { /* noop */ }
  return null;
}

async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${BUSINESS_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch (err) {
    console.error("[telegram-business-webhook] sendMessage error:", err);
  }
}
