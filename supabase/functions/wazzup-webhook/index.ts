/**
 * Edge Function: wazzup-webhook
 *
 * Webhook от Wazzup24 (https://wazzup24.com). Обрабатывает события:
 *  - messages[]   — входящие/исходящие (echo) сообщения в каналах WhatsApp/Instagram/etc.
 *  - statuses[]   — статусы доставки (sent / delivered / read / error).
 *  - channelsUpdates[] — изменение состояния канала (active / disabled / qridle / …).
 *  - { test: true } — тестовый ping при настройке webhook'а в кабинете Wazzup.
 *
 * Защита: Wazzup НЕ поддерживает custom-headers для webhooks. Поэтому мы
 * подсовываем секрет в query-string URL: …/wazzup-webhook?key=<secret>.
 * Секрет хранится в wazzup_settings.webhook_secret (генерируется при создании
 * настроек) и подставляется в URL, который пользователь копирует в кабинет
 * Wazzup. Любой запрос без правильного key — отбиваем 403.
 *
 * Деплой: --no-verify-jwt (Wazzup не шлёт JWT). Сама ф-я проверяет workspace
 * по совпадению webhook_secret в query.
 *
 * Для входящих сообщений:
 *  1. Находим канал по channelId → user_id сотрудника.
 *  2. Создаём (если ещё нет) системный проект-инбокс сотрудника.
 *  3. Создаём (если ещё нет) тред под клиента (по chatId).
 *  4. INSERT'им сообщение с source='wazzup', wazzup_message_id для дедупа.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface WazzupMessage {
  messageId: string;
  channelId: string;
  chatType: string;            // whatsapp | instagram | …
  chatId: string;              // телефон без + или username
  type: string;                // text | image | video | audio | document | geo | vcard | sticker | missed_call | …
  text?: string;
  contentUri?: string;         // ссылка на медиа (если type не text)
  isEcho?: boolean;            // true = исходящее (отправили мы или с другого устройства)
  dateTime?: string;
  authorName?: string;
  authorPhone?: string;
  contact?: { name?: string; avatarUri?: string; phone?: string; username?: string };
  status?: string;
  quotedMessage?: { messageId?: string };
}

interface WazzupStatus {
  messageId: string;
  status: "sent" | "delivered" | "read" | "error" | string;
  timestamp?: string;
  errorDescription?: string;
}

interface WazzupChannelUpdate {
  channelId: string;
  transport?: string;
  state?: string;
  name?: string;
}

interface WazzupWebhookPayload {
  test?: boolean;
  messages?: WazzupMessage[];
  statuses?: WazzupStatus[];
  channelsUpdates?: WazzupChannelUpdate[];
}

Deno.serve(async (req: Request) => {
  // Wazzup при настройке шлёт GET для проверки доступности URL.
  if (req.method === "GET") {
    return new Response("ok", { status: 200 });
  }
  if (req.method !== "POST") {
    return new Response("ok", { status: 200 });
  }

  const url = new URL(req.url);
  const providedSecret = url.searchParams.get("key");
  if (!providedSecret) {
    return new Response("forbidden", { status: 403 });
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Найдём воркспейс по секрету. Секрет уникален в пределах wazzup_settings.
  const { data: settings } = await service
    .from("wazzup_settings")
    .select("workspace_id, webhook_secret")
    .eq("webhook_secret", providedSecret)
    .maybeSingle();

  if (!settings) {
    console.warn("[wazzup-webhook] unknown webhook secret");
    return new Response("forbidden", { status: 403 });
  }

  let payload: WazzupWebhookPayload;
  try {
    payload = (await req.json()) as WazzupWebhookPayload;
  } catch {
    return new Response("ok", { status: 200 });
  }

  if (payload.test) {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  try {
    if (payload.messages?.length) {
      for (const msg of payload.messages) {
        await handleIncomingMessage(service, settings.workspace_id, msg);
      }
    }
    if (payload.statuses?.length) {
      for (const st of payload.statuses) {
        await handleStatus(service, st);
      }
    }
    if (payload.channelsUpdates?.length) {
      for (const ch of payload.channelsUpdates) {
        await handleChannelUpdate(service, settings.workspace_id, ch);
      }
    }
  } catch (err) {
    console.error("[wazzup-webhook] handler error:", err);
  }

  return new Response("ok", { status: 200 });
});

// ===========================================================================
// Входящие сообщения
// ===========================================================================

async function handleIncomingMessage(
  service: SupabaseClient,
  workspaceId: string,
  msg: WazzupMessage,
): Promise<void> {
  // 1. Канал
  const { data: channel } = await service
    .from("wazzup_channels")
    .select("id, user_id, transport, name, phone")
    .eq("workspace_id", workspaceId)
    .eq("channel_id", msg.channelId)
    .maybeSingle();

  if (!channel) {
    console.warn(`[wazzup-webhook] unknown channelId=${msg.channelId} ws=${workspaceId}`);
    return;
  }
  if (!channel.user_id) {
    console.warn(`[wazzup-webhook] channel ${msg.channelId} not assigned to a user yet`);
    return;
  }

  // 2. Системный инбокс сотрудника
  const projectId = await ensureSystemInboxProject(service, channel.user_id, workspaceId);

  // 3. Тред (один на клиента в рамках канала)
  const clientName =
    msg.contact?.name?.trim() ||
    msg.authorName?.trim() ||
    msg.contact?.username ||
    msg.contact?.phone ||
    msg.chatId;

  const threadId = await ensureWazzupThread(service, {
    projectId,
    workspaceId,
    channelDbId: channel.id as string,
    chatId: msg.chatId,
    chatType: msg.chatType,
    clientName,
  });

  // 4. Содержимое: text для текстовых, описание для медиа.
  const content =
    (msg.text ?? "").trim() ||
    (msg.contentUri ? `[${msg.type}] ${msg.contentUri}` : `[${msg.type}]`);

  // 5. Reply-lookup: ищем оригинал в БД по wazzup_message_id (если quotedMessage передан).
  let replyToDbId: string | null = null;
  if (msg.quotedMessage?.messageId) {
    const { data: replyRow } = await service
      .from("project_messages")
      .select("id")
      .eq("wazzup_message_id", msg.quotedMessage.messageId)
      .maybeSingle();
    replyToDbId = replyRow?.id ?? null;
  }

  // 6. Sender attribution.
  // isEcho=true → сообщение пришло «эхом» (отправлено сотрудником с телефона
  // или другого устройства, синхронизировалось через WhatsApp Web). Привязываем
  // к participant'у сотрудника.
  let senderParticipantId: string | null = null;
  let senderName: string;
  let senderRole: string;

  if (msg.isEcho) {
    const { data: participant } = await service
      .from("participants")
      .select("id, name, last_name")
      .eq("user_id", channel.user_id)
      .eq("workspace_id", workspaceId)
      .eq("is_deleted", false)
      .maybeSingle();
    senderParticipantId = participant?.id ?? null;
    senderName = participant
      ? [participant.name, participant.last_name].filter(Boolean).join(" ").trim()
      : "Сотрудник";
    senderRole = "Сотрудник";
  } else {
    senderName = clientName;
    senderRole = "Клиент";
  }

  const insertPayload = {
    project_id: projectId,
    workspace_id: workspaceId,
    sender_participant_id: senderParticipantId,
    sender_name: senderName,
    sender_role: senderRole,
    content,
    source: "wazzup",
    channel: "client",
    thread_id: threadId,
    wazzup_message_id: msg.messageId,
    wazzup_status: msg.status ?? null,
    reply_to_message_id: replyToDbId,
  };

  const { error } = await service.from("project_messages").insert(insertPayload);

  // 23505 = unique violation на uq_project_messages_wazzup_dedup. Это значит,
  // мы уже видели это сообщение (например, повторный webhook). Молча игнорируем.
  if (error && error.code !== "23505") {
    console.error("[wazzup-webhook] insert error:", error);
  }
}

// ===========================================================================
// Статусы доставки
// ===========================================================================

async function handleStatus(service: SupabaseClient, st: WazzupStatus): Promise<void> {
  await service
    .from("project_messages")
    .update({ wazzup_status: st.status })
    .eq("wazzup_message_id", st.messageId);
}

// ===========================================================================
// Обновления канала (state)
// ===========================================================================

async function handleChannelUpdate(
  service: SupabaseClient,
  workspaceId: string,
  ch: WazzupChannelUpdate,
): Promise<void> {
  await service
    .from("wazzup_channels")
    .update({
      state: ch.state ?? null,
      transport: ch.transport ?? undefined,
      name: ch.name ?? undefined,
      last_synced_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("channel_id", ch.channelId);
}

// ===========================================================================
// Helpers: системный инбокс и тред
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
    .eq("is_system_wazzup_inbox", true)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: created, error } = await service
    .from("projects")
    .insert({
      workspace_id: workspaceId,
      name: "Wazzup (WhatsApp)",
      description: "Системный проект: личные диалоги через Wazzup.",
      is_system_wazzup_inbox: true,
      system_inbox_user_id: userId,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(`Failed to create wazzup inbox: ${error?.message}`);
  }

  // Добавляем владельца как Администратора в project_participants.
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

  return created.id as string;
}

async function ensureWazzupThread(
  service: SupabaseClient,
  args: {
    projectId: string;
    workspaceId: string;
    channelDbId: string;
    chatId: string;
    chatType: string;
    clientName: string;
  },
): Promise<string> {
  const { data: existing } = await service
    .from("project_threads")
    .select("id")
    .eq("wazzup_channel_id", args.channelDbId)
    .eq("wazzup_chat_id", args.chatId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: created, error } = await service
    .from("project_threads")
    .insert({
      project_id: args.projectId,
      workspace_id: args.workspaceId,
      name: args.clientName,
      type: "chat",
      access_type: "all",
      wazzup_channel_id: args.channelDbId,
      wazzup_chat_id: args.chatId,
      wazzup_chat_type: args.chatType,
      icon: "message-circle",
      accent_color: "green",
    })
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(`Failed to create wazzup thread: ${error?.message}`);
  }
  return created.id as string;
}
