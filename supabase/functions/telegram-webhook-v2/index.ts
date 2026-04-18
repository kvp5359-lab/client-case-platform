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
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { telegramEntitiesToHtml } from "../_shared/telegramEntitiesToHtml.ts";
import { decode as decodeCb, encode as encodeCb, CallbackAction } from "./callback-data.ts";
import { renderArticle } from "./tiptap.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN_V2")!;
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET_V2");
const BOT_VERSION = "v2";
const PAGE_SIZE = 8;
const MAX_FILE_SIZE_MB = 20;

const service: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ═══════════════════════════════════════════════════════════════════════════
// Типы (подмножество Telegram Bot API)
// ═══════════════════════════════════════════════════════════════════════════

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TgEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TgUser;
}

interface TgPhotoSize {
  file_id: string;
  file_unique_id: string;
}

interface TgDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TgMessage {
  chat: { id: number; title?: string; type?: string };
  message_id: number;
  from?: TgUser;
  date: number;
  media_group_id?: string;
  text?: string;
  caption?: string;
  entities?: TgEntity[];
  caption_entities?: TgEntity[];
  reply_to_message?: { message_id: number };
  photo?: TgPhotoSize[];
  document?: TgDocument;
  video?: { file_id: string; file_unique_id: string; mime_type?: string; file_size?: number };
  voice?: { file_id: string; file_unique_id: string; mime_type?: string; file_size?: number };
  audio?: { file_id: string; file_unique_id: string; file_name?: string; mime_type?: string; file_size?: number };
  video_note?: { file_id: string; file_unique_id: string };
  sticker?: { file_id: string; file_unique_id: string; emoji?: string };
  new_chat_members?: TgUser[];
  left_chat_member?: TgUser;
  new_chat_title?: string;
  group_chat_created?: boolean;
  supergroup_chat_created?: boolean;
  pinned_message?: TgMessage;
  forward_origin?: {
    type: string;
    date: number;
    sender_user?: TgUser;
    sender_user_name?: string;
    sender_chat?: { id: number; title?: string };
    chat?: { id: number; title?: string };
  };
}

interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

interface TgReaction {
  chat: { id: number };
  message_id: number;
  user?: TgUser;
  new_reaction?: { type: "emoji" | "custom_emoji"; emoji?: string }[];
}

interface TgInlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}
type TgInlineKeyboard = TgInlineButton[][];

// ═══════════════════════════════════════════════════════════════════════════
// Telegram API helpers
// ═══════════════════════════════════════════════════════════════════════════

async function tgCall<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) {
      console.error(`[tg ${method}] error:`, json.description, body);
      return null;
    }
    return json.result as T;
  } catch (err) {
    console.error(`[tg ${method}] fetch failed:`, err);
    return null;
  }
}

type SendReplyMarkup =
  | { inline_keyboard: TgInlineKeyboard }
  | { keyboard: { text: string }[][]; resize_keyboard?: boolean; is_persistent?: boolean; selective?: boolean }
  | { remove_keyboard: true };

async function sendMessage(
  chatId: number,
  text: string,
  opts: { reply_markup?: SendReplyMarkup; parse_mode?: string; reply_to_message_id?: number } = {},
) {
  return tgCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: opts.parse_mode ?? "HTML",
    disable_web_page_preview: true,
    ...opts,
  });
}

async function editMessage(
  chatId: number,
  messageId: number,
  text: string,
  keyboard?: TgInlineKeyboard,
) {
  return tgCall("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
  });
}

async function answerCallback(id: string, text?: string) {
  return tgCall("answerCallbackQuery", { callback_query_id: id, text });
}

// ═══════════════════════════════════════════════════════════════════════════
// Утилиты
// ═══════════════════════════════════════════════════════════════════════════

function formatUserName(u: TgUser | undefined): string {
  if (!u) return "Пользователь";
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "Пользователь";
}

function sanitizeFileName(name: string): string {
  const cyr: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"j",
    к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",
    х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
    А:"A",Б:"B",В:"V",Г:"G",Д:"D",Е:"E",Ё:"Yo",Ж:"Zh",З:"Z",И:"I",Й:"J",
    К:"K",Л:"L",М:"M",Н:"N",О:"O",П:"P",Р:"R",С:"S",Т:"T",У:"U",Ф:"F",
    Х:"Kh",Ц:"Ts",Ч:"Ch",Ш:"Sh",Щ:"Shch",Ъ:"",Ы:"Y",Ь:"",Э:"E",Ю:"Yu",Я:"Ya",
  };
  const ext = name.includes(".") ? "." + name.split(".").pop() : "";
  const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  const t = base.split("").map((c) => cyr[c] ?? c).join("");
  return t.replace(/[^a-zA-Z0-9._\-() ]/g, "_").replace(/\s+/g, "_") + ext;
}

interface TgChatBinding {
  project_id: string;
  workspace_id: string;
  channel: string;
  thread_id: string | null;
}

/** Найти привязку группы с фильтром v2. Возвращает null, если группа не привязана или привязана к v1. */
async function findChatBinding(chatId: number): Promise<TgChatBinding | null> {
  const { data } = await service
    .from("project_telegram_chats")
    .select("project_id, workspace_id, channel, thread_id")
    .eq("telegram_chat_id", chatId)
    .eq("is_active", true)
    .eq("bot_version", BOT_VERSION)
    .maybeSingle();
  return data ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Entry point
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!WEBHOOK_SECRET) {
    console.error("TELEGRAM_WEBHOOK_SECRET_V2 is not set");
    return new Response("Server misconfigured", { status: 500 });
  }
  if (req.headers.get("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const update = await req.json();

    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message_reaction) {
      await handleReaction(update.message_reaction);
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

// ═══════════════════════════════════════════════════════════════════════════
// Основная обработка сообщения
// ═══════════════════════════════════════════════════════════════════════════

async function handleMessage(msg: TgMessage, isEdited: boolean) {
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

// ═══════════════════════════════════════════════════════════════════════════
// Синхронизация обычных групповых сообщений (копия логики v1 + v2-фильтр)
// ═══════════════════════════════════════════════════════════════════════════

async function syncGroupMessage(msg: TgMessage, binding: TgChatBinding, isEdited: boolean) {
  const chatId = msg.chat.id;
  const telegramMessageId = msg.message_id;
  const rawText = msg.text ?? msg.caption ?? "";
  const entities = msg.entities ?? msg.caption_entities;
  const text = telegramEntitiesToHtml(rawText, entities);
  const replyToTgMsgId = msg.reply_to_message?.message_id ?? null;

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
    await service
      .from("project_messages")
      .update({ content: text || rawText, is_edited: true })
      .eq("telegram_message_id", telegramMessageId)
      .eq("telegram_chat_id", chatId);
    return;
  }

  // Новый/существующий participant по telegram_user_id
  const senderParticipantId = msg.from
    ? await findOrCreateParticipant(binding.workspace_id, msg.from)
    : null;

  // Дедупликация
  const { data: existing } = await service
    .from("project_messages")
    .select("id")
    .eq("telegram_message_id", telegramMessageId)
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  if (existing) return;

  // Reply resolution
  let replyToDbId: string | null = null;
  if (replyToTgMsgId) {
    const { data: replyMsg } = await service
      .from("project_messages")
      .select("id")
      .eq("project_id", binding.project_id)
      .eq("telegram_message_id", replyToTgMsgId)
      .maybeSingle();
    replyToDbId = replyMsg?.id ?? null;
  }

  const forward = extractForward(msg);

  const { data: inserted } = await service
    .from("project_messages")
    .insert({
      project_id: binding.project_id,
      workspace_id: binding.workspace_id,
      sender_participant_id: senderParticipantId,
      sender_name: formatUserName(msg.from),
      sender_role: "Telegram",
      content: text || "📎",
      source: "telegram",
      channel: binding.channel || "client",
      thread_id: binding.thread_id ?? undefined,
      telegram_message_id: telegramMessageId,
      telegram_chat_id: chatId,
      reply_to_message_id: replyToDbId,
      forwarded_from_name: forward.name,
      forwarded_date: forward.date,
    })
    .select("id")
    .single();

  if (inserted) {
    await downloadAttachments(msg, inserted.id, binding.workspace_id, binding.project_id);
  }
}

function getServiceMessageText(msg: TgMessage): string | null {
  const fromName = formatUserName(msg.from);
  if (msg.group_chat_created || msg.supergroup_chat_created) {
    return `${fromName} создал(а) группу` + (msg.chat.title ? ` «${msg.chat.title}»` : "");
  }
  if (msg.new_chat_members && msg.new_chat_members.length > 0) {
    const names = msg.new_chat_members.map(formatUserName);
    if (names.length === 1 && msg.from?.id === msg.new_chat_members[0].id) {
      return `${names[0]} присоединился(-ась) к группе`;
    }
    return `${fromName} добавил(а) ${names.join(", ")}`;
  }
  if (msg.left_chat_member) {
    const left = formatUserName(msg.left_chat_member);
    return msg.from?.id === msg.left_chat_member.id
      ? `${left} покинул(а) группу`
      : `${fromName} удалил(а) ${left}`;
  }
  if (msg.new_chat_title) return `${fromName} изменил(а) название на «${msg.new_chat_title}»`;
  if (msg.pinned_message) return `${fromName} закрепил(а) сообщение`;
  return null;
}

function extractForward(msg: TgMessage): { name: string | null; date: string | null } {
  if (!msg.forward_origin) return { name: null, date: null };
  const o = msg.forward_origin;
  const date = new Date(o.date * 1000).toISOString();
  switch (o.type) {
    case "user":
      return { name: o.sender_user ? formatUserName(o.sender_user) : null, date };
    case "hidden_user":
      return { name: o.sender_user_name ?? "Скрытый пользователь", date };
    case "chat":
    case "channel":
      return { name: o.sender_chat?.title ?? o.chat?.title ?? null, date };
    default:
      return { name: "Переслано", date };
  }
}

async function findOrCreateParticipant(workspaceId: string, from: TgUser): Promise<string | null> {
  const { data: existing } = await service
    .from("participants")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("telegram_user_id", from.id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await service
    .from("participants")
    .insert({
      workspace_id: workspaceId,
      name: from.first_name ?? "Telegram User",
      last_name: from.last_name ?? null,
      email: `tg_${from.id}@telegram.placeholder`,
      telegram_user_id: from.id,
      workspace_roles: ["Telegram-контакт"],
      can_login: false,
      is_deleted: false,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: race } = await service
        .from("participants")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("telegram_user_id", from.id)
        .maybeSingle();
      return race?.id ?? null;
    }
    console.error("create participant failed:", error);
    return null;
  }
  return created.id;
}

// ═══════════════════════════════════════════════════════════════════════════
// Вложения (копия v1, упрощена)
// ═══════════════════════════════════════════════════════════════════════════

interface TgFileDescriptor {
  fileId: string;
  originalName: string;
  safeName: string;
  mimeType: string;
}

function collectFiles(msg: TgMessage): TgFileDescriptor[] {
  const out: TgFileDescriptor[] = [];
  if (msg.photo && msg.photo.length > 0) {
    const p = msg.photo[msg.photo.length - 1];
    const name = `photo_${p.file_unique_id}.jpg`;
    out.push({ fileId: p.file_id, originalName: name, safeName: name, mimeType: "image/jpeg" });
  }
  if (msg.document) {
    const orig = msg.document.file_name || `document_${msg.document.file_unique_id}`;
    out.push({
      fileId: msg.document.file_id,
      originalName: orig,
      safeName: sanitizeFileName(orig),
      mimeType: msg.document.mime_type || "application/octet-stream",
    });
  }
  if (msg.voice) {
    const name = `voice_${msg.voice.file_unique_id}.ogg`;
    out.push({ fileId: msg.voice.file_id, originalName: name, safeName: name, mimeType: msg.voice.mime_type || "audio/ogg" });
  }
  if (msg.audio) {
    const orig = msg.audio.file_name || `audio_${msg.audio.file_unique_id}`;
    out.push({
      fileId: msg.audio.file_id,
      originalName: orig,
      safeName: sanitizeFileName(orig),
      mimeType: msg.audio.mime_type || "audio/mpeg",
    });
  }
  if (msg.video) {
    const name = `video_${msg.video.file_unique_id}.mp4`;
    out.push({ fileId: msg.video.file_id, originalName: name, safeName: name, mimeType: msg.video.mime_type || "video/mp4" });
  }
  if (msg.video_note) {
    const name = `videonote_${msg.video_note.file_unique_id}.mp4`;
    out.push({ fileId: msg.video_note.file_id, originalName: name, safeName: name, mimeType: "video/mp4" });
  }
  return out;
}

async function fetchTelegramFile(fileId: string): Promise<{ buffer: ArrayBuffer; path: string } | null> {
  const info = await tgCall<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
  if (!info?.file_path) return null;
  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${info.file_path}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return { buffer: await res.arrayBuffer(), path: info.file_path };
}

async function downloadAttachments(msg: TgMessage, messageId: string, workspaceId: string, projectId: string) {
  const files = collectFiles(msg);
  const skipped: string[] = [];
  for (const f of files) {
    const dl = await fetchTelegramFile(f.fileId);
    if (!dl) {
      skipped.push(f.originalName);
      continue;
    }
    const storagePath = `${workspaceId}/${projectId}/${messageId}/${f.safeName}`;
    const { error: upErr } = await service.storage.from("files").upload(storagePath, dl.buffer, {
      contentType: f.mimeType,
      upsert: false,
    });
    if (upErr) {
      console.error("storage upload error:", upErr);
      continue;
    }
    const { data: fileRow, error: fileErr } = await service
      .from("files")
      .insert({
        workspace_id: workspaceId,
        bucket: "files",
        storage_path: storagePath,
        file_name: f.originalName,
        file_size: dl.buffer.byteLength,
        mime_type: f.mimeType,
      })
      .select("id")
      .single();
    if (fileErr) {
      console.error("files insert error:", fileErr);
      continue;
    }
    await service.from("message_attachments").insert({
      message_id: messageId,
      file_name: f.originalName,
      file_size: dl.buffer.byteLength,
      mime_type: f.mimeType,
      storage_path: storagePath,
      telegram_file_id: f.fileId,
      file_id: fileRow.id,
    });
  }

  if (skipped.length > 0) {
    const { data: cur } = await service
      .from("project_messages")
      .select("content")
      .eq("id", messageId)
      .single();
    const warn = skipped.length === 1
      ? `\n\n⚠️ Файл «${skipped[0]}» слишком большой (макс. ${MAX_FILE_SIZE_MB} МБ через Telegram)`
      : `\n\n⚠️ Файлы слишком большие:\n${skipped.map((n) => `• ${n}`).join("\n")}`;
    await service
      .from("project_messages")
      .update({ content: (cur?.content ?? "") + warn })
      .eq("id", messageId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Реакции (копия v1, + фильтр v2 в ветке "message not found")
// ═══════════════════════════════════════════════════════════════════════════

async function handleReaction(r: TgReaction) {
  if (!r.user) return;
  const chatId = r.chat.id;
  const msgId = r.message_id;
  const userId = r.user.id;
  const userName = formatUserName(r.user);

  const { data: msg } = await service
    .from("project_messages")
    .select("id, workspace_id")
    .eq("telegram_chat_id", chatId)
    .eq("telegram_message_id", msgId)
    .maybeSingle();

  const emojis = (r.new_reaction ?? [])
    .filter((x) => x.type === "emoji" && x.emoji)
    .map((x) => x.emoji!);

  if (!msg) {
    // Сообщение не найдено — вставляем реакцию как отдельное сообщение, но только для v2-групп
    const binding = await findChatBinding(chatId);
    if (!binding || emojis.length === 0) return;
    const participantId = await participantByTgId(binding.workspace_id, userId);
    await service.from("project_messages").insert({
      project_id: binding.project_id,
      workspace_id: binding.workspace_id,
      sender_participant_id: participantId,
      sender_name: userName,
      sender_role: "Telegram",
      content: emojis.join(" "),
      source: "telegram",
      channel: binding.channel || "client",
      thread_id: binding.thread_id ?? undefined,
      telegram_message_id: null,
      telegram_chat_id: chatId,
    });
    return;
  }

  const participantId = await participantByTgId(msg.workspace_id, userId);
  await service.from("message_reactions").delete().eq("message_id", msg.id).eq("telegram_user_id", userId);
  if (emojis.length > 0) {
    await service.from("message_reactions").insert(
      emojis.map((e) => ({
        message_id: msg.id,
        participant_id: participantId,
        telegram_user_id: userId,
        telegram_user_name: userName,
        emoji: e,
      })),
    );
  }
}

async function participantByTgId(workspaceId: string, tgId: number): Promise<string | null> {
  const { data } = await service
    .from("participants")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("telegram_user_id", tgId)
    .eq("is_deleted", false)
    .maybeSingle();
  return data?.id ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Команды
// ═══════════════════════════════════════════════════════════════════════════

async function handleCommand(msg: TgMessage, text: string) {
  const chatId = msg.chat.id;
  const isPrivate = msg.chat.type === "private";
  // Убираем @botname из команды (/menu@bot → /menu)
  const cleaned = text.replace(/@\w+/, "");
  const [cmd, ...args] = cleaned.split(/\s+/);

  switch (cmd) {
    case "/start":
      if (isPrivate) await cmdStartPrivate(chatId, args[0], msg.from);
      else await sendMessage(chatId, helpText());
      return;
    case "/help":
      await sendMessage(chatId, helpText());
      return;
    case "/link":
      await cmdLink(chatId, args[0], msg);
      return;
    case "/unlink":
      await cmdUnlink(chatId);
      return;
    case "/menu":
      if (isPrivate) {
        await sendMessage(chatId, "Эта команда работает в группе проекта.");
        return;
      }
      await showMainMenu(chatId);
      return;
    case "/knowledge":
      if (isPrivate) {
        await sendMessage(chatId, "Эта команда работает в группе проекта.");
        return;
      }
      await showKbGroups(chatId, null, 0);
      return;
    case "/upload":
      if (isPrivate) {
        await sendMessage(chatId, "Эта команда работает в группе проекта.");
        return;
      }
      await showUploadSlots(chatId, msg.from);
      return;
    case "/status":
      if (isPrivate) {
        await sendMessage(chatId, "Эта команда работает в группе проекта.");
        return;
      }
      await showDocStatus(chatId);
      return;
    case "/requirements":
      if (isPrivate) {
        await sendMessage(chatId, "Эта команда работает в группе проекта.");
        return;
      }
      await showFolderInfo(chatId);
      return;
    default:
      // Неизвестная команда — молчим
      return;
  }
}

function helpText(): string {
  return [
    "<b>Бот проекта ClientCase</b>",
    "",
    "Команды в группе проекта:",
    "• /menu — главное меню",
    "• /knowledge — полезные материалы",
    "• /requirements — требования к документам",
    "• /upload — загрузить документ в слот",
    "• /status — статус документов",
    "",
    "Команды для админа:",
    "• /link КОД — привязать группу к проекту",
    "• /unlink — отвязать группу",
  ].join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// /start в личке — deep-link привязка participant
// ═══════════════════════════════════════════════════════════════════════════

async function cmdStartPrivate(chatId: number, tokenArg: string | undefined, from: TgUser | undefined) {
  if (!tokenArg || !from) {
    await sendMessage(chatId, [
      "Привет! Я бот для работы с вашим проектом в ClientCase.",
      "",
      "Этот чат — только для технической привязки аккаунта. Основное общение идёт в групповом чате проекта.",
      "",
      "Если вы хотите привязать свой Telegram к аккаунту ClientCase — зайдите в профиль на сайте и нажмите «Привязать Telegram».",
    ].join("\n"));
    return;
  }

  // Валидность UUID (простая проверка)
  if (!/^[0-9a-f-]{36}$/i.test(tokenArg)) {
    await sendMessage(chatId, "Неверный формат токена привязки.");
    return;
  }

  const { data: tok } = await service
    .from("telegram_link_tokens")
    .select("token, participant_id, workspace_id, expires_at, consumed_at")
    .eq("token", tokenArg)
    .maybeSingle();

  if (!tok) {
    await sendMessage(chatId, "Токен не найден. Сгенерируйте новый на сайте.");
    return;
  }
  if (tok.consumed_at) {
    await sendMessage(chatId, "Этот токен уже использован. Сгенерируйте новый на сайте.");
    return;
  }
  if (new Date(tok.expires_at).getTime() < Date.now()) {
    await sendMessage(chatId, "Срок действия токена истёк. Сгенерируйте новый на сайте.");
    return;
  }

  // Не конфликтует ли Telegram-аккаунт уже с другим participant?
  const { data: conflict } = await service
    .from("participants")
    .select("id")
    .eq("workspace_id", tok.workspace_id)
    .eq("telegram_user_id", from.id)
    .eq("is_deleted", false)
    .neq("id", tok.participant_id)
    .maybeSingle();

  if (conflict) {
    await sendMessage(chatId, "Этот Telegram-аккаунт уже привязан к другому участнику. Обратитесь к администратору.");
    return;
  }

  // Привязываем
  const { error: updErr } = await service
    .from("participants")
    .update({ telegram_user_id: from.id })
    .eq("id", tok.participant_id);

  if (updErr) {
    console.error("link participant error:", updErr);
    await sendMessage(chatId, "Не удалось привязать — попробуйте ещё раз.");
    return;
  }

  await service
    .from("telegram_link_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token", tokenArg);

  await sendMessage(chatId, "✅ Ваш Telegram привязан к аккаунту. Теперь в группах проектов бот узнаёт вас.");
}

// ═══════════════════════════════════════════════════════════════════════════
// /link КОД  и  /unlink
// ═══════════════════════════════════════════════════════════════════════════

async function cmdLink(chatId: number, codeArg: string | undefined, msg: TgMessage) {
  if (!codeArg) {
    await sendMessage(chatId, "Укажите код: /link КОД");
    return;
  }
  const code = codeArg.trim().toUpperCase();

  const { data: thread } = await service
    .from("project_threads")
    .select("id, project_id, workspace_id, name, legacy_channel")
    .eq("link_code", code)
    .maybeSingle();

  if (!thread) {
    await sendMessage(chatId, "Чат с таким кодом не найден.");
    return;
  }

  // Существует ли уже привязка этого треда?
  const { data: existing } = await service
    .from("project_telegram_chats")
    .select("id")
    .eq("thread_id", thread.id)
    .maybeSingle();

  const payload = {
    project_id: thread.project_id,
    workspace_id: thread.workspace_id,
    telegram_chat_id: chatId,
    telegram_chat_title: msg.chat.title ?? null,
    channel: thread.legacy_channel ?? "client",
    thread_id: thread.id,
    is_active: true,
    bot_version: BOT_VERSION,
  };

  if (existing) {
    await service.from("project_telegram_chats").update(payload).eq("id", existing.id);
  } else {
    await service.from("project_telegram_chats").insert(payload);
  }

  // Приветствие с постоянной кнопкой «📋 Меню» внизу
  await sendMessage(
    chatId,
    `✅ Группа привязана к чату «${thread.name}».\n\nВнизу теперь есть кнопка <b>📋 Меню</b> — нажмите её в любой момент, чтобы открыть разделы бота.`,
    { reply_markup: menuReplyKeyboard() },
  );

  // Напомним про права админа (реакции требуют administrator)
  const me = await tgCall<{ status: string }>("getChatMember", {
    chat_id: chatId,
    user_id: parseInt(BOT_TOKEN.split(":")[0], 10),
  });
  if (me && me.status !== "administrator" && me.status !== "creator") {
    await sendMessage(chatId, "⚠️ Для синхронизации реакций сделайте бота администратором группы.");
  }
}

async function cmdUnlink(chatId: number) {
  const { data: row } = await service
    .from("project_telegram_chats")
    .select("id")
    .eq("telegram_chat_id", chatId)
    .eq("is_active", true)
    .eq("bot_version", BOT_VERSION)
    .maybeSingle();
  if (!row) {
    await sendMessage(chatId, "Эта группа не привязана.");
    return;
  }
  await service.from("project_telegram_chats").update({ is_active: false }).eq("id", row.id);
  await sendMessage(chatId, "Группа отвязана.");
}

// ═══════════════════════════════════════════════════════════════════════════
// Главное меню
// ═══════════════════════════════════════════════════════════════════════════

const MAIN_MENU_TEXT = "<b>Главное меню</b>\n\nВыберите раздел:";
const MENU_REPLY_BUTTON_TEXT = "📋 Меню";

/** Inline-клавиатура главного меню — используется и в /menu, и в callback menu_home. */
function mainMenuInlineKeyboard(): TgInlineKeyboard {
  return [
    [
      { text: "📚 Полезные материалы", callback_data: encodeCb({ kind: "kb_group", groupId: null, page: 0 }) },
      { text: "❓ Требования", callback_data: encodeCb({ kind: "folder_info" }) },
    ],
    [
      { text: "📎 Загрузить документ", callback_data: encodeCb({ kind: "upload_start" }) },
      { text: "📊 Статус документов", callback_data: encodeCb({ kind: "doc_status" }) },
    ],
  ];
}

/**
 * Постоянная reply-клавиатура с одной кнопкой «📋 Меню» — держится в чате
 * всегда, чтобы клиенту не нужно было помнить команды. Тап отправляет текст
 * "📋 Меню", handleMessage перехватывает его и запускает главное меню.
 */
function menuReplyKeyboard() {
  return {
    keyboard: [[{ text: MENU_REPLY_BUTTON_TEXT }]],
    resize_keyboard: true,
    is_persistent: true,
  };
}

async function showMainMenu(chatId: number) {
  const binding = await findChatBinding(chatId);
  if (!binding) {
    await sendMessage(chatId, "Группа ещё не привязана к проекту. Используйте /link КОД.");
    return;
  }
  await sendMessage(chatId, MAIN_MENU_TEXT, {
    reply_markup: { inline_keyboard: mainMenuInlineKeyboard() },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// База знаний
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Собирает id всех статей, доступных в рамках проекта, через шаблон.
 * Возвращает null, если у проекта нет template_id.
 */
async function getProjectAccessibleArticleIds(projectId: string): Promise<Set<string> | null> {
  const { data: project } = await service
    .from("projects")
    .select("template_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project?.template_id) return null;

  const [{ data: articleLinks }, { data: groupLinks }] = await Promise.all([
    service.from("knowledge_article_templates").select("article_id").eq("project_template_id", project.template_id),
    service.from("knowledge_group_templates").select("group_id").eq("project_template_id", project.template_id),
  ]);

  const ids = new Set<string>((articleLinks ?? []).map((l: { article_id: string }) => l.article_id));
  const groupIds = (groupLinks ?? []).map((l: { group_id: string }) => l.group_id);
  if (groupIds.length > 0) {
    const { data: groupArticles } = await service
      .from("knowledge_article_groups")
      .select("article_id")
      .in("group_id", groupIds);
    for (const ga of groupArticles ?? []) ids.add(ga.article_id);
  }
  return ids;
}

async function showKbGroups(chatId: number, parentGroupId: string | null, page: number, editMsgId?: number) {
  const binding = await findChatBinding(chatId);
  if (!binding) {
    await sendMessage(chatId, "Группа ещё не привязана к проекту.");
    return;
  }

  // Список статей, доступных в проекте (через шаблон проекта)
  const accessibleArticleIds = await getProjectAccessibleArticleIds(binding.project_id);
  if (!accessibleArticleIds) {
    const text = "📚 <b>База знаний</b>\n\n<i>Полезные материалы этого проекта ещё не настроены.</i>";
    const kb: TgInlineKeyboard = [[{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }]];
    if (editMsgId) await editMessage(chatId, editMsgId, text, kb);
    else await sendMessage(chatId, text, { reply_markup: { inline_keyboard: kb } });
    return;
  }
  if (accessibleArticleIds.size === 0) {
    const text = "📚 <b>База знаний</b>\n\n<i>В этом проекте пока нет материалов.</i>";
    const kb: TgInlineKeyboard = [[{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }]];
    if (editMsgId) await editMessage(chatId, editMsgId, text, kb);
    else await sendMessage(chatId, text, { reply_markup: { inline_keyboard: kb } });
    return;
  }

  // Загружаем статьи с их группами — чтобы построить дерево
  const articleIdArray = [...accessibleArticleIds];
  const { data: articlesData } = await service
    .from("knowledge_articles")
    .select("id, title, is_published, knowledge_article_groups(group_id, sort_order)")
    .in("id", articleIdArray)
    .eq("is_published", true);

  type ArticleData = {
    id: string;
    title: string;
    knowledge_article_groups: { group_id: string; sort_order: number | null }[];
  };
  const articlesList = (articlesData ?? []) as ArticleData[];

  // Загружаем все группы workspace, чтобы знать parent_id
  const { data: allGroupsData } = await service
    .from("knowledge_groups")
    .select("id, name, parent_id, sort_order")
    .eq("workspace_id", binding.workspace_id)
    .order("sort_order", { ascending: true });
  type GroupRow = { id: string; name: string; parent_id: string | null; sort_order: number | null };
  const allGroups = (allGroupsData ?? []) as GroupRow[];

  // Плоская структура (как в веб-UI проекта):
  // — группы показываем только те, к которым НАПРЯМУЮ привязаны доступные статьи
  //   (никаких родительских групп дерева не раскручиваем)
  // — статьи без группы идут отдельным списком на корневом экране
  const groupById = new Map(allGroups.map((g) => [g.id, g]));
  const directGroupIds = new Set<string>();
  for (const a of articlesList) {
    for (const ag of a.knowledge_article_groups) directGroupIds.add(ag.group_id);
  }
  const ungroupedArticles = articlesList.filter((a) => a.knowledge_article_groups.length === 0);

  let screenGroups: GroupRow[] = [];
  let screenArticles: { id: string; title: string }[] = [];
  let parentTitle = "База знаний проекта";

  if (parentGroupId === null) {
    // Корень: плоский список всех прямых групп + статьи без группы
    screenGroups = allGroups.filter((g) => directGroupIds.has(g.id));
    screenArticles = ungroupedArticles.map((a) => ({ id: a.id, title: a.title }));
  } else {
    // Внутри группы: только её статьи, без вложенных подгрупп
    const fullId = await resolvePrefixId("knowledge_groups", binding.workspace_id, parentGroupId);
    if (!fullId) {
      const text = "📚 <b>База знаний</b>\n\n<i>Раздел не найден.</i>";
      const kb: TgInlineKeyboard = [[{ text: "↑ К разделам", callback_data: encodeCb({ kind: "kb_group", groupId: null, page: 0 }) }]];
      if (editMsgId) await editMessage(chatId, editMsgId, text, kb);
      else await sendMessage(chatId, text, { reply_markup: { inline_keyboard: kb } });
      return;
    }
    screenArticles = articlesList
      .filter((a) => a.knowledge_article_groups.some((ag) => ag.group_id === fullId))
      .sort((a, b) => {
        const ao = a.knowledge_article_groups.find((ag) => ag.group_id === fullId)?.sort_order ?? 0;
        const bo = b.knowledge_article_groups.find((ag) => ag.group_id === fullId)?.sort_order ?? 0;
        return (ao ?? 0) - (bo ?? 0);
      })
      .map((a) => ({ id: a.id, title: a.title }));
    parentTitle = groupById.get(fullId)?.name ?? "Раздел";
  }

  const groups = screenGroups;
  const articles = screenArticles;

  const items: TgInlineButton[] = [];
  for (const g of groups ?? []) {
    items.push({ text: `📁 ${g.name}`, callback_data: encodeCb({ kind: "kb_group", groupId: g.id, page: 0 }) });
  }
  for (const a of articles) {
    items.push({ text: `📄 ${a.title}`, callback_data: encodeCb({ kind: "kb_article", articleId: a.id }) });
  }

  const total = items.length;
  const start = page * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);

  const keyboard: TgInlineKeyboard = pageItems.map((b) => [b]);

  // Навигация по страницам
  const navRow: TgInlineButton[] = [];
  if (page > 0) {
    navRow.push({ text: "‹ Назад", callback_data: encodeCb({ kind: "kb_group", groupId: parentGroupId, page: page - 1 }) });
  }
  if (start + PAGE_SIZE < total) {
    navRow.push({ text: "Вперёд ›", callback_data: encodeCb({ kind: "kb_group", groupId: parentGroupId, page: page + 1 }) });
  }
  if (navRow.length) keyboard.push(navRow);

  // Наверх / в главное меню
  if (parentGroupId !== null) {
    keyboard.push([{ text: "↑ К разделам", callback_data: encodeCb({ kind: "kb_group", groupId: null, page: 0 }) }]);
  }
  keyboard.push([{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }]);

  const title = parentGroupId === null
    ? "📚 <b>База знаний проекта</b>"
    : `📚 <b>${escapeHtml(parentTitle)}</b>`;
  const text = total === 0
    ? `${title}\n\n<i>Здесь пока нет материалов.</i>`
    : `${title}\n\nВыберите материал${total > PAGE_SIZE ? ` (стр. ${page + 1}/${Math.ceil(total / PAGE_SIZE)})` : ""}:`;

  if (editMsgId) {
    await editMessage(chatId, editMsgId, text, keyboard);
  } else {
    await sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
  }
}

async function showArticle(chatId: number, articlePrefix: string, from?: TgUser) {
  const binding = await findChatBinding(chatId);
  if (!binding) return;
  const fullId = await resolvePrefixId("knowledge_articles", binding.workspace_id, articlePrefix);
  if (!fullId) {
    await sendMessage(chatId, "Статья не найдена.");
    return;
  }
  const { data: article } = await service
    .from("knowledge_articles")
    .select("id, title, content, is_published")
    .eq("id", fullId)
    .maybeSingle();

  if (!article || !article.is_published) {
    await sendMessage(chatId, "Статья недоступна.");
    return;
  }

  const chunks = renderArticle(article.title, article.content);
  for (const c of chunks) {
    await sendMessage(chatId, c);
  }
  await sendMessage(chatId, "Что дальше?", {
    reply_markup: {
      inline_keyboard: [[
        { text: "← К разделам", callback_data: encodeCb({ kind: "kb_group", groupId: null, page: 0 }) },
        { text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) },
      ]],
    },
  });

  // Служебное уведомление в чат проекта: «Кто-то открыл статью»
  if (from) {
    await logServiceEvent(
      chatId,
      binding,
      from,
      `👁️ ${formatUserName(from)} открыл(а) статью «${article.title}»`,
    );
  }
}

/**
 * Пишет служебное сообщение в project_messages чата проекта.
 *
 * sender_name = реальное имя пользователя, совершившего действие (чтобы в
 * web-UI превью/уведомления не показывали обобщённого «Бот»).
 * sender_participant_id подтягиваем по telegram_user_id — тогда в UI
 * подхватится аватарка и форматирование как у обычных сообщений.
 *
 * Параметр `counted` управляет, попадёт ли событие в счётчик непрочитанных
 * сайдбара (RPC get_inbox_threads_v2 исключает source='telegram_service'):
 *   - counted=false → source='telegram_service' (видно в чате, не дёргает бейдж)
 *   - counted=true  → source='bot_event'        (дёргает бейдж)
 */
async function logServiceEvent(
  _chatId: number,
  binding: TgChatBinding,
  from: TgUser,
  text: string,
  opts: { counted?: boolean } = {},
) {
  const participantId = await participantByTgId(binding.workspace_id, from.id);
  await service.from("project_messages").insert({
    project_id: binding.project_id,
    workspace_id: binding.workspace_id,
    sender_participant_id: participantId,
    sender_name: formatUserName(from),
    sender_role: null,
    content: text,
    source: opts.counted ? "bot_event" : "telegram_service",
    channel: binding.channel || "client",
    thread_id: binding.thread_id ?? undefined,
  });
}

async function resolvePrefixId(
  table: "knowledge_articles" | "knowledge_groups" | "knowledge_qa" | "folder_slots",
  workspaceId: string,
  prefix: string,
): Promise<string | null> {
  // UUID имеет тип uuid в Postgres, ilike не работает напрямую — кастим через RPC-стиль фильтр.
  // Проще: фильтруем на клиенте после получения всех id workspace (их обычно не миллионы).
  // В будущем — заменить на текстовый индекс по id::text, если выборка станет большой.
  const { data } = await service
    .from(table)
    .select("id")
    .eq("workspace_id", workspaceId);
  if (!data) return null;
  const matches = data.filter((r: { id: string }) => r.id.startsWith(prefix.toLowerCase()));
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    console.warn(`[resolvePrefixId] ambiguous prefix ${prefix} in ${table}`);
    return null;
  }
  return matches[0].id;
}

// ═══════════════════════════════════════════════════════════════════════════
// Загрузка документа в слот
// ═══════════════════════════════════════════════════════════════════════════

async function showDocStatus(chatId: number, editMsgId?: number) {
  const binding = await findChatBinding(chatId);
  if (!binding) {
    await sendMessage(chatId, "Группа ещё не привязана к проекту.");
    return;
  }

  const { data: slotsData } = await service
    .from("folder_slots")
    .select(`
      id, name, sort_order, document_id, folder_id,
      folders ( id, name, sort_order ),
      statuses ( name ),
      documents ( name )
    `)
    .eq("project_id", binding.project_id)
    .order("sort_order", { ascending: true });

  type SlotRow = {
    id: string;
    name: string;
    sort_order: number | null;
    document_id: string | null;
    folder_id: string | null;
    folders: { id: string; name: string; sort_order: number | null } | null;
    statuses: { name: string } | null;
    documents: { name: string } | null;
  };
  const slots = (slotsData ?? []) as SlotRow[];

  if (slots.length === 0) {
    const kb: TgInlineKeyboard = [[{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }]];
    const text = "📊 <b>Статус документов</b>\n\n<i>В этом проекте пока нет слотов для документов.</i>";
    if (editMsgId) await editMessage(chatId, editMsgId, text, kb);
    else await sendMessage(chatId, text, { reply_markup: { inline_keyboard: kb } });
    return;
  }

  // Группируем по папке
  type Bucket = { folderName: string; folderOrder: number; rows: SlotRow[] };
  const byFolder = new Map<string, Bucket>();
  for (const s of slots) {
    const key = s.folder_id ?? "__none__";
    if (!byFolder.has(key)) {
      byFolder.set(key, {
        folderName: s.folders?.name ?? "Без папки",
        folderOrder: s.folders?.sort_order ?? 999999,
        rows: [],
      });
    }
    byFolder.get(key)!.rows.push(s);
  }

  const folders = [...byFolder.values()].sort((a, b) => a.folderOrder - b.folderOrder);

  const lines: string[] = ["📊 <b>Статус документов</b>", ""];
  let totalFilled = 0;
  let totalEmpty = 0;
  for (const f of folders) {
    lines.push(`<b>${escapeHtml(f.folderName)}</b>`);
    for (const s of f.rows) {
      if (s.document_id) {
        totalFilled++;
        const docName = s.documents?.name ?? "документ";
        const status = s.statuses?.name;
        lines.push(
          `  ✅ ${escapeHtml(s.name)}: <i>${escapeHtml(docName)}</i>` +
            (status ? ` · <b>${escapeHtml(status)}</b>` : ""),
        );
      } else {
        totalEmpty++;
        lines.push(`  ❌ ${escapeHtml(s.name)} · <i>пусто</i>`);
      }
    }
    lines.push("");
  }
  // Документы без папки — загруженные «свободно», без привязки к слоту
  const { data: freeDocsData } = await service
    .from("documents")
    .select("id, name, created_at")
    .eq("project_id", binding.project_id)
    .is("folder_id", null)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });
  type FreeDoc = { id: string; name: string; created_at: string };
  const freeDocs = (freeDocsData ?? []) as FreeDoc[];

  if (freeDocs.length > 0) {
    lines.push("<b>БЕЗ ПАПКИ</b>");
    for (const d of freeDocs) {
      lines.push(`  📄 <i>${escapeHtml(d.name)}</i>`);
    }
    lines.push("");
  }

  lines.push(
    `Всего: заполнено <b>${totalFilled}</b>, пусто <b>${totalEmpty}</b>` +
      (freeDocs.length > 0 ? `, без папки <b>${freeDocs.length}</b>` : ""),
  );

  const text = lines.join("\n");

  const kb: TgInlineKeyboard = [
    [
      { text: "📎 Загрузить документ", callback_data: encodeCb({ kind: "upload_start" }) },
      { text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) },
    ],
  ];

  // Статус-сообщение может легко превысить 4096 символов на больших проектах.
  // В этом случае режем и шлём несколько сообщений.
  if (text.length <= 4000) {
    if (editMsgId) await editMessage(chatId, editMsgId, text, kb);
    else await sendMessage(chatId, text, { reply_markup: { inline_keyboard: kb } });
    return;
  }

  // Чанкинг: правим существующее сообщение первым куском, остальное шлём.
  const chunks: string[] = [];
  let buf = "";
  for (const line of lines) {
    if ((buf + "\n" + line).length > 3800) {
      chunks.push(buf);
      buf = line;
    } else {
      buf += (buf ? "\n" : "") + line;
    }
  }
  if (buf) chunks.push(buf);

  if (editMsgId) await editMessage(chatId, editMsgId, chunks[0]);
  else await sendMessage(chatId, chunks[0]);
  for (let i = 1; i < chunks.length - 1; i++) await sendMessage(chatId, chunks[i]);
  await sendMessage(chatId, chunks[chunks.length - 1], { reply_markup: { inline_keyboard: kb } });
}

async function showFolderInfo(chatId: number, editMsgId?: number) {
  const binding = await findChatBinding(chatId);
  if (!binding) {
    await sendMessage(chatId, "Группа ещё не привязана к проекту.");
    return;
  }

  const { data: foldersData } = await service
    .from("folders")
    .select("id, name, sort_order, knowledge_article_id")
    .eq("project_id", binding.project_id)
    .not("knowledge_article_id", "is", null)
    .order("sort_order", { ascending: true });

  type FolderRow = { id: string; name: string; sort_order: number | null; knowledge_article_id: string };
  const folders = (foldersData ?? []) as FolderRow[];

  if (folders.length === 0) {
    const kb: TgInlineKeyboard = [[{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }]];
    const text = "❓ <b>Требования к документам</b>\n\n<i>Для этого проекта пока не заведены описания групп документов.</i>";
    if (editMsgId) await editMessage(chatId, editMsgId, text, kb);
    else await sendMessage(chatId, text, { reply_markup: { inline_keyboard: kb } });
    return;
  }

  const keyboard: TgInlineKeyboard = folders.map((f) => [
    { text: `📁 ${f.name}`, callback_data: encodeCb({ kind: "folder_article", folderId: f.id }) },
  ]);
  keyboard.push([{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }]);

  const text = "❓ <b>Требования к документам</b>\n\nВыберите группу, чтобы посмотреть, что именно нужно:";
  if (editMsgId) await editMessage(chatId, editMsgId, text, keyboard);
  else await sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
}

async function showFolderArticle(chatId: number, folderPrefix: string, from?: TgUser) {
  const binding = await findChatBinding(chatId);
  if (!binding) return;

  // Резолвим папку по префиксу в рамках проекта
  const { data: allFolders } = await service
    .from("folders")
    .select("id, name, knowledge_article_id")
    .eq("project_id", binding.project_id);
  const folder = (allFolders ?? []).find((f: { id: string }) => f.id.startsWith(folderPrefix.toLowerCase()));
  if (!folder || !folder.knowledge_article_id) {
    await sendMessage(chatId, "Группа не найдена или для неё нет описания.");
    return;
  }

  const { data: article } = await service
    .from("knowledge_articles")
    .select("id, title, content, is_published")
    .eq("id", folder.knowledge_article_id)
    .maybeSingle();
  if (!article || !article.is_published) {
    await sendMessage(chatId, "Описание требований недоступно.");
    return;
  }

  const chunks = renderArticle(article.title, article.content);
  for (const c of chunks) await sendMessage(chatId, c);

  await sendMessage(chatId, "Что дальше?", {
    reply_markup: {
      inline_keyboard: [
        [{
          // Переход напрямую в список слотов этой папки — тот же экран, что
          // открывается через «Загрузить документ» → выбор папки. Логика
          // загрузки полностью переиспользована через callback upload_folder.
          text: `📎 Загрузить в группу «${folder.name}»`,
          callback_data: encodeCb({ kind: "upload_folder", folderId: folder.id }),
        }],
        [{ text: "← К требованиям", callback_data: encodeCb({ kind: "folder_info" }) }],
        [{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }],
      ],
    },
  });

  if (from) {
    await logServiceEvent(
      chatId,
      binding,
      from,
      `👁️ ${formatUserName(from)} открыл(а) требования к группе «${folder.name}»`,
    );
  }
}

/**
 * Шаг 1 загрузки: показать список папок проекта с прогрессом «заполнено / всего».
 * Клик → showUploadFolderSlots(folderId).
 */
async function showUploadSlots(chatId: number, from: TgUser | undefined, editMsgId?: number) {
  const binding = await findChatBinding(chatId);
  if (!binding || !from) {
    await sendMessage(chatId, "Группа ещё не привязана к проекту.");
    return;
  }

  // Все слоты проекта — чтобы посчитать прогресс по папкам
  const { data: slotsData } = await service
    .from("folder_slots")
    .select("id, name, folder_id, document_id, sort_order, folders(id, name, sort_order)")
    .eq("project_id", binding.project_id)
    .order("sort_order", { ascending: true });

  type SlotRow = {
    id: string;
    name: string;
    folder_id: string | null;
    document_id: string | null;
    sort_order: number | null;
    folders: { id: string; name: string; sort_order: number | null } | null;
  };
  const slots = (slotsData ?? []) as SlotRow[];

  // Группируем по folder_id и считаем прогресс
  type Bucket = {
    folderId: string | null;
    folderName: string;
    folderOrder: number;
    filled: number;
    total: number;
  };
  const byFolder = new Map<string, Bucket>();
  for (const s of slots) {
    const key = s.folder_id ?? "__none__";
    if (!byFolder.has(key)) {
      byFolder.set(key, {
        folderId: s.folder_id,
        folderName: s.folders?.name ?? "Без папки",
        folderOrder: s.folders?.sort_order ?? 999999,
        filled: 0,
        total: 0,
      });
    }
    const b = byFolder.get(key)!;
    b.total++;
    if (s.document_id) b.filled++;
  }

  const folders = [...byFolder.values()].sort((a, b) => a.folderOrder - b.folderOrder);

  const keyboard: TgInlineKeyboard = folders
    .filter((f) => f.folderId !== null) // слоты без папки пока пропускаем
    .map((f) => {
      const remaining = f.total - f.filled;
      const statusSuffix = remaining === 0 ? " ✓" : ` (${f.filled}/${f.total})`;
      return [{
        text: `📁 ${f.folderName}${statusSuffix}`,
        callback_data: encodeCb({ kind: "upload_folder", folderId: f.folderId! }),
      }];
    });

  // Слоты без папки проекта — отдельной кнопкой, если они есть
  const noFolderBucket = byFolder.get("__none__");
  if (noFolderBucket && noFolderBucket.total > 0) {
    const remaining = noFolderBucket.total - noFolderBucket.filled;
    keyboard.push([{
      text: `📂 Прочие слоты${remaining === 0 ? " ✓" : ` (${noFolderBucket.filled}/${noFolderBucket.total})`}`,
      callback_data: encodeCb({ kind: "upload_folder", folderId: "__none__" }),
    }]);
  }

  // Загрузка без привязки к слоту (попадает в «Без папки»)
  keyboard.push([{ text: "📁 Загрузить без привязки", callback_data: encodeCb({ kind: "upload_free" }) }]);
  keyboard.push([{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }]);

  const text = folders.length === 0 && !noFolderBucket
    ? "<b>В этом проекте нет слотов для документов.</b>\n\nМожно загрузить документ без привязки — он попадёт в раздел «Без папки»."
    : "<b>Выберите папку</b>\n\nВ скобках — заполнено из общего числа слотов.";

  if (editMsgId) {
    await editMessage(chatId, editMsgId, text, keyboard);
  } else {
    await sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
  }
}

/**
 * Шаг 2 загрузки: список ПУСТЫХ слотов выбранной папки.
 */
async function showUploadFolderSlots(
  chatId: number,
  from: TgUser,
  folderPrefix: string,
  editMsgId?: number,
) {
  const binding = await findChatBinding(chatId);
  if (!binding) return;

  // Спецкод "__none__" — слоты без папки
  const isNoFolder = folderPrefix === "__none__";
  let fullFolderId: string | null = null;
  let folderName = "Прочие слоты";

  // Есть ли у папки статья с требованиями (для кнопки «Прочитать требования»)
  let hasRequirementsArticle = false;

  if (!isNoFolder) {
    const { data: allFolders } = await service
      .from("folders")
      .select("id, name, knowledge_article_id")
      .eq("project_id", binding.project_id);
    const f = (allFolders ?? []).find((x: { id: string }) => x.id.startsWith(folderPrefix.toLowerCase()));
    if (!f) {
      await sendMessage(chatId, "Папка не найдена.");
      return;
    }
    fullFolderId = f.id;
    folderName = f.name;
    hasRequirementsArticle = !!f.knowledge_article_id;
  }

  let slotsQuery = service
    .from("folder_slots")
    .select("id, name, sort_order, document_id")
    .eq("project_id", binding.project_id)
    .is("document_id", null)
    .order("sort_order", { ascending: true });
  if (isNoFolder) {
    slotsQuery = slotsQuery.is("folder_id", null);
  } else {
    slotsQuery = slotsQuery.eq("folder_id", fullFolderId!);
  }

  const { data: slots } = await slotsQuery;

  const keyboard: TgInlineKeyboard = (slots ?? []).map((s: { id: string; name: string }) => [{
    text: `📎 ${s.name}`,
    callback_data: encodeCb({ kind: "upload_slot", slotId: s.id }),
  }]);
  // Загрузка в эту папку без привязки к конкретному слоту —
  // возможна только для реальных папок (не для "Прочие слоты" без folder_id).
  if (!isNoFolder && fullFolderId) {
    keyboard.push([{
      text: "📁 Загрузить в эту папку (без слота)",
      callback_data: encodeCb({ kind: "upload_folder_free", folderId: fullFolderId }),
    }]);
  }
  // Показать требования к группе (если статья настроена) — зеркальная кнопка
  // к «Загрузить в группу» с экрана требований. Callback тот же, что и из
  // «❓ Требования к документам» → выбор группы.
  if (!isNoFolder && fullFolderId && hasRequirementsArticle) {
    keyboard.push([{
      text: "❓ Прочитать требования",
      callback_data: encodeCb({ kind: "folder_article", folderId: fullFolderId }),
    }]);
  }
  keyboard.push([{ text: "← К папкам", callback_data: encodeCb({ kind: "upload_start" }) }]);
  keyboard.push([{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }]);

  const text = !slots || slots.length === 0
    ? `<b>📁 ${escapeHtml(folderName)}</b>\n\n<i>Все слоты этой папки уже заполнены.</i>`
    : `<b>📁 ${escapeHtml(folderName)}</b>\n\nВыберите слот для загрузки:`;

  if (editMsgId) await editMessage(chatId, editMsgId, text, keyboard);
  else await sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });

  // Чтобы "from" считался использованным
  void from;
}

async function onSlotSelected(chatId: number, from: TgUser, slotPrefix: string, editMsgId?: number) {
  const binding = await findChatBinding(chatId);
  if (!binding) return;
  const slotId = await resolvePrefixId("folder_slots", binding.workspace_id, slotPrefix);
  if (!slotId) {
    await sendMessage(chatId, "Слот не найден.");
    return;
  }
  const { data: slot } = await service
    .from("folder_slots")
    .select("id, name, document_id, project_id")
    .eq("id", slotId)
    .maybeSingle();
  if (!slot || slot.project_id !== binding.project_id) {
    await sendMessage(chatId, "Слот не найден или относится к другому проекту.");
    return;
  }
  if (slot.document_id) {
    await sendMessage(chatId, "В этот слот уже загружен документ.");
    return;
  }

  await setSession(chatId, from.id, "awaiting_file", { slot_id: slot.id, slot_name: slot.name });

  const text = `✅ Выбран слот <b>${escapeHtml(slot.name)}</b>.\n\n📎 Прикрепите файл ответным сообщением (до ${MAX_FILE_SIZE_MB} МБ).`;
  if (editMsgId) {
    await editMessage(chatId, editMsgId, text, [[
      { text: "❌ Отмена", callback_data: encodeCb({ kind: "upload_cancel" }) },
    ]]);
  } else {
    await sendMessage(chatId, text, {
      reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: encodeCb({ kind: "upload_cancel" }) }]] },
    });
  }
}

/**
 * Включает режим «многофайловой» загрузки.
 * folderPrefix = null → файлы попадают в раздел «Без папки».
 * folderPrefix = <uuid8> → файлы попадают в указанную папку (но без слота).
 */
async function onFreeUploadSelected(
  chatId: number,
  from: TgUser,
  folderPrefix: string | null,
  editMsgId?: number,
) {
  const binding = await findChatBinding(chatId);
  if (!binding) return;

  let targetFolderId: string | null = null;
  let targetFolderName: string | null = null;
  if (folderPrefix) {
    const { data: allFolders } = await service
      .from("folders")
      .select("id, name")
      .eq("project_id", binding.project_id);
    const f = (allFolders ?? []).find((x: { id: string }) => x.id.startsWith(folderPrefix.toLowerCase()));
    if (!f) {
      await sendMessage(chatId, "Папка не найдена.");
      return;
    }
    targetFolderId = f.id;
    targetFolderName = f.name;
  }

  await setSession(chatId, from.id, "awaiting_free_file", {
    target_folder_id: targetFolderId,
    target_folder_name: targetFolderName,
  });

  const destination = targetFolderName
    ? `в папку <b>«${escapeHtml(targetFolderName)}»</b> (без привязки к слоту)`
    : "в раздел <b>«Без папки»</b>";
  const text = `✅ Режим: <b>свободная загрузка</b>.\n\n📎 Прикрепите файл ответным сообщением (до ${MAX_FILE_SIZE_MB} МБ). Документ попадёт ${destination}.`;
  const cancelRow = [[{ text: "❌ Отмена", callback_data: encodeCb({ kind: "upload_cancel" }) }]];
  if (editMsgId) {
    await editMessage(chatId, editMsgId, text, cancelRow);
  } else {
    await sendMessage(chatId, text, { reply_markup: { inline_keyboard: cancelRow } });
  }
}

/** Общая логика: скачать файл из Telegram, создать documents+files+версию, запустить extract-text. */
async function uploadDocumentCore(
  msg: TgMessage,
  binding: TgChatBinding,
  folderId: string | null,
): Promise<{ ok: true; docId: string; fileName: string } | { ok: false; reason: string }> {
  const chatId = msg.chat.id;
  const files = collectFiles(msg);
  if (files.length === 0) return { ok: false, reason: "no_file" };
  if (files.length > 1) return { ok: false, reason: "multiple_files" };

  const f = files[0];
  const declaredSize =
    msg.document?.file_size ?? msg.video?.file_size ?? msg.audio?.file_size ?? msg.voice?.file_size ?? 0;
  if (declaredSize && declaredSize > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return { ok: false, reason: "too_large" };
  }

  const dl = await fetchTelegramFile(f.fileId);
  if (!dl) return { ok: false, reason: "download_failed" };

  const { data: doc, error: docErr } = await service
    .from("documents")
    .insert({
      folder_id: folderId,
      project_id: binding.project_id,
      workspace_id: binding.workspace_id,
      name: f.originalName,
      status: "pending",
    })
    .select("id")
    .single();
  if (docErr || !doc) {
    console.error("create doc error:", docErr);
    return { ok: false, reason: "create_document_failed" };
  }

  const ts = Date.now();
  const storagePath = `${binding.workspace_id}/${doc.id}/v1_${ts}_${f.safeName}`;
  const { error: upErr } = await service.storage.from("files").upload(storagePath, dl.buffer, {
    contentType: f.mimeType,
    upsert: false,
  });
  if (upErr) {
    console.error("storage upload:", upErr);
    await service.from("documents").delete().eq("id", doc.id);
    return { ok: false, reason: "storage_upload_failed" };
  }

  const { data: fileRow, error: fileErr } = await service
    .from("files")
    .insert({
      workspace_id: binding.workspace_id,
      bucket: "files",
      storage_path: storagePath,
      file_name: f.originalName,
      file_size: dl.buffer.byteLength,
      mime_type: f.mimeType,
    })
    .select("id")
    .single();
  if (fileErr || !fileRow) {
    console.error("files insert:", fileErr);
    await service.storage.from("files").remove([storagePath]);
    await service.from("documents").delete().eq("id", doc.id);
    return { ok: false, reason: "file_insert_failed" };
  }

  const { error: verErr } = await service.rpc("add_document_version_service", {
    p_document_id: doc.id,
    p_file_path: storagePath,
    p_file_name: f.originalName,
    p_file_size: dl.buffer.byteLength,
    p_mime_type: f.mimeType,
    p_file_id: fileRow.id,
  });
  if (verErr) {
    console.error("add_document_version:", verErr);
    await service.storage.from("files").remove([storagePath]);
    await service.from("files").delete().eq("id", fileRow.id);
    await service.from("documents").delete().eq("id", doc.id);
    return { ok: false, reason: "version_failed" };
  }

  await service.from("documents").update({ status: "in_progress" }).eq("id", doc.id);

  // Fire-and-forget: извлечение текста, чтобы документ был виден в «Выбрать из проекта»
  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  if (internalSecret) {
    fetch(`${SUPABASE_URL}/functions/v1/extract-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": internalSecret,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ document_id: doc.id }),
    }).catch((err) => console.warn("[extract-text] fire-and-forget failed:", err));
  }

  // Мы не возвращаем chatId — он используется только для сообщений об ошибках выше.
  void chatId;
  return { ok: true, docId: doc.id, fileName: f.originalName };
}

async function handleFreeFileUpload(msg: TgMessage, binding: TgChatBinding) {
  const chatId = msg.chat.id;
  const from = msg.from!;

  // Целевую папку (если есть) берём из сессии, установленной на onFreeUploadSelected
  const sessionBefore = await getSession(chatId, from.id);
  const ctxBefore = (sessionBefore?.context ?? {}) as {
    target_folder_id?: string | null;
    target_folder_name?: string | null;
  };
  const targetFolderId = ctxBefore.target_folder_id ?? null;
  const targetFolderName = ctxBefore.target_folder_name ?? null;

  const result = await uploadDocumentCore(msg, binding, targetFolderId);
  if (!result.ok) {
    if (result.reason === "no_file") {
      await clearSession(chatId, from.id);
    }
    const errText = mapUploadError(result.reason);
    await sendMessage(chatId, errText, { reply_to_message_id: msg.message_id });
    return;
  }

  const mediaGroupId = msg.media_group_id ?? null;

  const ctx = (sessionBefore?.context ?? {}) as {
    batch_msg_id?: number;
    batch_group_id?: string;
    batch_names?: string[];
    target_folder_id?: string | null;
    target_folder_name?: string | null;
  };

  const isSameBatch =
    ctx.batch_msg_id &&
    ctx.batch_group_id &&
    mediaGroupId &&
    ctx.batch_group_id === mediaGroupId;

  const names = isSameBatch ? [...(ctx.batch_names ?? []), result.fileName] : [result.fileName];

  const destinationLabel = targetFolderName
    ? `в папку «${targetFolderName}»`
    : "в «Без папки»";

  const confirmationText = names.length === 1
    ? `✅ Загружен <b>${escapeHtml(names[0])}</b> ${escapeHtml(destinationLabel)}. Можно присылать ещё файлы.`
    : `✅ Загружено файлов: <b>${names.length}</b> ${escapeHtml(destinationLabel)}:\n` +
      names.map((n) => `• ${escapeHtml(n)}`).join("\n") +
      "\n\nМожно присылать ещё.";

  const keyboard: TgInlineKeyboard = [
    [
      { text: "✅ Готово", callback_data: encodeCb({ kind: "upload_finish" }) },
      { text: "📊 Статус", callback_data: encodeCb({ kind: "doc_status" }) },
    ],
    [{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }],
  ];

  let newBatchMsgId: number | null = null;
  if (isSameBatch && ctx.batch_msg_id) {
    await editMessage(chatId, ctx.batch_msg_id, confirmationText, keyboard);
    newBatchMsgId = ctx.batch_msg_id;
  } else {
    const sent = await sendMessage(chatId, confirmationText, {
      reply_to_message_id: msg.message_id,
      reply_markup: { inline_keyboard: keyboard },
    }) as { message_id?: number } | null;
    newBatchMsgId = sent?.message_id ?? null;
  }

  // Обновляем состояние сессии: накопление батча + сохраняем папку-назначение
  await setSession(chatId, from.id, "awaiting_free_file", {
    batch_msg_id: newBatchMsgId,
    batch_group_id: mediaGroupId,
    batch_names: names,
    target_folder_id: targetFolderId,
    target_folder_name: targetFolderName,
  });

  const logDest = targetFolderName
    ? `в папку «${targetFolderName}» (без слота)`
    : "без привязки к слоту";
  await logServiceEvent(
    chatId,
    binding,
    from,
    `📎 ${formatUserName(from)} загрузил(а) документ «${result.fileName}» ${logDest}`,
    { counted: true },
  );
}

function mapUploadError(reason: string): string {
  switch (reason) {
    case "no_file":
      return "Не вижу файла в сообщении. Прикрепите документ или фото.";
    case "multiple_files":
      return "Пожалуйста, пришлите один файл за раз.";
    case "too_large":
      return `⚠️ Файл больше ${MAX_FILE_SIZE_MB} МБ. Загрузите его через веб-интерфейс ClientCase.`;
    case "download_failed":
      return `⚠️ Не удалось получить файл (возможно, больше ${MAX_FILE_SIZE_MB} МБ). Загрузите через веб.`;
    default:
      return "⚠️ Не удалось загрузить документ.";
  }
}

async function handleSlotFileUpload(msg: TgMessage, binding: TgChatBinding, slotId: string) {
  const chatId = msg.chat.id;
  const from = msg.from!;

  // Проверяем слот ещё раз — вдруг параллельно заполнился
  const { data: slot } = await service
    .from("folder_slots")
    .select("id, name, document_id, folder_id")
    .eq("id", slotId)
    .maybeSingle();
  if (!slot || slot.document_id) {
    await clearSession(chatId, from.id);
    await sendMessage(chatId, "Слот уже занят — отмена.", { reply_to_message_id: msg.message_id });
    return;
  }

  const files = collectFiles(msg);
  if (files.length === 0) {
    await sendMessage(chatId, "Не вижу файла в сообщении. Прикрепите документ или фото.", {
      reply_to_message_id: msg.message_id,
    });
    return;
  }
  if (files.length > 1) {
    await sendMessage(chatId, "Пожалуйста, пришлите один файл за раз.", {
      reply_to_message_id: msg.message_id,
    });
    return;
  }
  const f = files[0];

  // Проверка размера (если есть в описании)
  const declaredSize =
    msg.document?.file_size ?? msg.video?.file_size ?? msg.audio?.file_size ?? msg.voice?.file_size ?? 0;
  if (declaredSize && declaredSize > MAX_FILE_SIZE_MB * 1024 * 1024) {
    await sendMessage(chatId, `⚠️ Файл больше ${MAX_FILE_SIZE_MB} МБ. Загрузите его через веб-интерфейс ClientCase.`, {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  // Скачиваем
  const dl = await fetchTelegramFile(f.fileId);
  if (!dl) {
    await sendMessage(chatId, `⚠️ Не удалось получить файл (возможно, больше ${MAX_FILE_SIZE_MB} МБ). Загрузите через веб.`, {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  // Создаём документ
  const { data: doc, error: docErr } = await service
    .from("documents")
    .insert({
      folder_id: slot.folder_id,
      project_id: binding.project_id,
      workspace_id: binding.workspace_id,
      name: f.originalName,
      status: "pending",
    })
    .select("id")
    .single();
  if (docErr || !doc) {
    console.error("create doc error:", docErr);
    await sendMessage(chatId, "⚠️ Не удалось создать документ.", { reply_to_message_id: msg.message_id });
    return;
  }

  // Storage
  const ts = Date.now();
  const storagePath = `${binding.workspace_id}/${doc.id}/v1_${ts}_${f.safeName}`;
  const { error: upErr } = await service.storage.from("files").upload(storagePath, dl.buffer, {
    contentType: f.mimeType,
    upsert: false,
  });
  if (upErr) {
    console.error("storage upload:", upErr);
    await service.from("documents").delete().eq("id", doc.id);
    await sendMessage(chatId, "⚠️ Не удалось загрузить файл в хранилище.", { reply_to_message_id: msg.message_id });
    return;
  }

  // files
  const { data: fileRow, error: fileErr } = await service
    .from("files")
    .insert({
      workspace_id: binding.workspace_id,
      bucket: "files",
      storage_path: storagePath,
      file_name: f.originalName,
      file_size: dl.buffer.byteLength,
      mime_type: f.mimeType,
    })
    .select("id")
    .single();
  if (fileErr || !fileRow) {
    console.error("files insert:", fileErr);
    await service.storage.from("files").remove([storagePath]);
    await service.from("documents").delete().eq("id", doc.id);
    await sendMessage(chatId, "⚠️ Не удалось сохранить метаданные файла.", { reply_to_message_id: msg.message_id });
    return;
  }

  // add_document_version_service RPC (служебный вариант без проверки auth.uid())
  const { error: verErr } = await service.rpc("add_document_version_service", {
    p_document_id: doc.id,
    p_file_path: storagePath,
    p_file_name: f.originalName,
    p_file_size: dl.buffer.byteLength,
    p_mime_type: f.mimeType,
    p_file_id: fileRow.id,
  });
  if (verErr) {
    console.error("add_document_version:", verErr);
    // Компенсация
    await service.storage.from("files").remove([storagePath]);
    await service.from("files").delete().eq("id", fileRow.id);
    await service.from("documents").delete().eq("id", doc.id);
    await sendMessage(chatId, "⚠️ Не удалось зафиксировать версию документа.", { reply_to_message_id: msg.message_id });
    return;
  }

  await service.from("documents").update({ status: "in_progress" }).eq("id", doc.id);

  // fill_slot_atomic_service (служебный вариант без проверки auth.uid())
  const { error: fillErr } = await service.rpc("fill_slot_atomic_service", {
    p_slot_id: slot.id,
    p_document_id: doc.id,
    p_project_id: binding.project_id,
  });
  if (fillErr) {
    console.error("fill_slot_atomic:", fillErr);
    await sendMessage(chatId, `⚠️ Не удалось заполнить слот «${slot.name}» (возможно, он уже заполнен кем-то ещё).`, {
      reply_to_message_id: msg.message_id,
    });
    await clearSession(chatId, from.id);
    return;
  }

  await clearSession(chatId, from.id);
  await sendMessage(
    chatId,
    `✅ Документ <b>${escapeHtml(f.originalName)}</b> загружен в слот <b>${escapeHtml(slot.name)}</b>.`,
    {
      reply_to_message_id: msg.message_id,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📎 Загрузить ещё", callback_data: encodeCb({ kind: "upload_start" }) },
            { text: "📊 Статус", callback_data: encodeCb({ kind: "doc_status" }) },
          ],
          [{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }],
        ],
      },
    },
  );

  // Служебное уведомление в чат проекта — важное, в счётчик непрочитанных
  await logServiceEvent(
    chatId,
    binding,
    from,
    `📎 ${formatUserName(from)} загрузил(а) документ «${f.originalName}» в слот «${slot.name}»`,
    { counted: true },
  );

  // Fire-and-forget: запустить извлечение текста, чтобы документ стал виден
  // в выборе «Выбрать из проекта» и чтобы работала кнопка «Просмотреть содержимое».
  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  if (internalSecret) {
    fetch(`${SUPABASE_URL}/functions/v1/extract-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": internalSecret,
        // Supabase Functions требует Authorization для любого вызова функции —
        // кладём anon-подобный токен (service-role здесь безопасен, тк функция
        // сама обнаружит x-internal-secret и не будет полагаться на JWT).
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ document_id: doc.id }),
    }).catch((err) => console.warn("[extract-text] fire-and-forget failed:", err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Callback queries (нажатия inline-кнопок)
// ═══════════════════════════════════════════════════════════════════════════

async function handleCallback(cb: TgCallbackQuery) {
  if (!cb.data || !cb.message) {
    await answerCallback(cb.id);
    return;
  }
  const action = decodeCb(cb.data);
  if (!action) {
    await answerCallback(cb.id, "Неизвестная команда.");
    return;
  }
  const chatId = cb.message.chat.id;
  const msgId = cb.message.message_id;

  switch (action.kind) {
    case "menu_home":
      await answerCallback(cb.id);
      await clearSession(chatId, cb.from.id);
      await editMessage(chatId, msgId, MAIN_MENU_TEXT, mainMenuInlineKeyboard());
      return;
    case "kb_group":
      await answerCallback(cb.id);
      await showKbGroups(chatId, action.groupId, action.page, msgId);
      return;
    case "kb_article":
      await answerCallback(cb.id);
      await showArticle(chatId, action.articleId, cb.from);
      return;
    case "upload_start":
      await answerCallback(cb.id);
      await showUploadSlots(chatId, cb.from, msgId);
      return;
    case "upload_folder":
      await answerCallback(cb.id);
      await showUploadFolderSlots(chatId, cb.from, action.folderId, msgId);
      return;
    case "doc_status":
      await answerCallback(cb.id);
      await showDocStatus(chatId, msgId);
      return;
    case "folder_info":
      await answerCallback(cb.id);
      await showFolderInfo(chatId, msgId);
      return;
    case "folder_article":
      await answerCallback(cb.id);
      await showFolderArticle(chatId, action.folderId, cb.from);
      return;
    case "upload_slot":
      await answerCallback(cb.id);
      await onSlotSelected(chatId, cb.from, action.slotId, msgId);
      return;
    case "upload_free":
      await answerCallback(cb.id);
      await onFreeUploadSelected(chatId, cb.from, null, msgId);
      return;
    case "upload_folder_free":
      await answerCallback(cb.id);
      await onFreeUploadSelected(chatId, cb.from, action.folderId, msgId);
      return;
    case "upload_cancel":
      await answerCallback(cb.id, "Отменено.");
      await clearSession(chatId, cb.from.id);
      await editMessage(chatId, msgId, "Загрузка отменена.");
      return;
    case "upload_finish":
      // «Готово» — пользователь завершил многофайловую загрузку. Сессию закрываем,
      // но в отличие от «Отмена» не переписываем историю как «Отменено» — ведь
      // файлы реально загружены. Просто показываем подтверждение и меню.
      await answerCallback(cb.id, "Готово!");
      await clearSession(chatId, cb.from.id);
      await sendMessage(chatId, "✅ Загрузка завершена. Что дальше?", {
        reply_markup: { inline_keyboard: mainMenuInlineKeyboard() },
      });
      return;
    case "nav_back":
      await answerCallback(cb.id);
      if (action.screen === "kb") await showKbGroups(chatId, null, 0, msgId);
      else await editMessage(chatId, msgId, "<b>Главное меню</b>", [
        [{ text: "📚 База знаний", callback_data: encodeCb({ kind: "kb_group", groupId: null, page: 0 }) }],
      ]);
      return;
    default:
      await answerCallback(cb.id);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Личный чат (не /start)
// ═══════════════════════════════════════════════════════════════════════════

async function handlePrivateMessage(_msg: TgMessage) {
  // Пока — ничего. В личке работают только /start <token> и /help.
}

// ═══════════════════════════════════════════════════════════════════════════
// Сессии (telegram_bot_sessions)
// ═══════════════════════════════════════════════════════════════════════════

interface BotSession {
  state: string;
  context: Record<string, unknown>;
}

async function getSession(chatId: number, userId: number): Promise<BotSession | null> {
  const { data } = await service
    .from("telegram_bot_sessions")
    .select("state, context, expires_at")
    .eq("telegram_chat_id", chatId)
    .eq("telegram_user_id", userId)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await clearSession(chatId, userId);
    return null;
  }
  return { state: data.state, context: data.context ?? {} };
}

async function setSession(chatId: number, userId: number, state: string, context: Record<string, unknown>) {
  await service.from("telegram_bot_sessions").upsert(
    {
      telegram_chat_id: chatId,
      telegram_user_id: userId,
      state,
      context,
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    },
    { onConflict: "telegram_chat_id,telegram_user_id" },
  );
}

async function clearSession(chatId: number, userId: number) {
  await service
    .from("telegram_bot_sessions")
    .delete()
    .eq("telegram_chat_id", chatId)
    .eq("telegram_user_id", userId);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
