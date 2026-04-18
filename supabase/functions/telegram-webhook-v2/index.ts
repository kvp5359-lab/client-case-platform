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

async function sendMessage(
  chatId: number,
  text: string,
  opts: { reply_markup?: { inline_keyboard: TgInlineKeyboard }; parse_mode?: string; reply_to_message_id?: number } = {},
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
      return; // файл ушёл в слот, сообщением в чате НЕ дублируем
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
    "• /knowledge — база знаний",
    "• /upload — загрузить документ в слот",
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

  await sendMessage(chatId, `✅ Группа привязана к чату «${thread.name}».\n\nНапишите /menu, чтобы открыть меню.`);

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

async function showMainMenu(chatId: number) {
  const binding = await findChatBinding(chatId);
  if (!binding) {
    await sendMessage(chatId, "Группа ещё не привязана к проекту. Используйте /link КОД.");
    return;
  }
  await sendMessage(chatId, "<b>Главное меню</b>\n\nВыберите раздел:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📚 База знаний", callback_data: encodeCb({ kind: "kb_group", groupId: null, page: 0 }) }],
        [{ text: "📎 Загрузить документ", callback_data: encodeCb({ kind: "kb_qa_list", page: 0 }) }],
      ],
    },
  });
  // Для простоты: вторая кнопка пока ведёт на Q&A, а загрузка вызывается /upload.
  // В v2 кнопки загрузки привяжем к сообщениям сотрудников.
}

// ═══════════════════════════════════════════════════════════════════════════
// База знаний
// ═══════════════════════════════════════════════════════════════════════════

async function showKbGroups(chatId: number, parentGroupId: string | null, page: number, editMsgId?: number) {
  const binding = await findChatBinding(chatId);
  if (!binding) {
    await sendMessage(chatId, "Группа ещё не привязана к проекту.");
    return;
  }

  let groupsQuery = service
    .from("knowledge_groups")
    .select("id, name")
    .eq("workspace_id", binding.workspace_id)
    .order("sort_order", { ascending: true });
  if (parentGroupId === null) {
    groupsQuery = groupsQuery.is("parent_id", null);
  } else {
    // Нужно найти полный UUID по префиксу
    const fullId = await resolvePrefixId("knowledge_groups", binding.workspace_id, parentGroupId);
    if (!fullId) {
      await sendMessage(chatId, "Раздел не найден.");
      return;
    }
    groupsQuery = groupsQuery.eq("parent_id", fullId);
  }
  const { data: groups } = await groupsQuery;

  // Статьи в этой группе (is_public_for_clients + is_published)
  let articles: { id: string; title: string }[] = [];
  if (parentGroupId !== null) {
    const fullId = await resolvePrefixId("knowledge_groups", binding.workspace_id, parentGroupId);
    if (fullId) {
      const { data } = await service
        .from("knowledge_article_groups")
        .select("article_id, sort_order, knowledge_articles!inner(id, title, workspace_id, is_public_for_clients, is_published)")
        .eq("group_id", fullId)
        .eq("knowledge_articles.workspace_id", binding.workspace_id)
        .eq("knowledge_articles.is_public_for_clients", true)
        .eq("knowledge_articles.is_published", true)
        .order("sort_order", { ascending: true });
      articles = (data ?? []).map((r: {article_id: string; knowledge_articles: {id: string; title: string}}) => ({ id: r.knowledge_articles.id, title: r.knowledge_articles.title }));
    }
  }

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

  const title = parentGroupId === null ? "📚 <b>База знаний</b>" : "📚 <b>Раздел базы знаний</b>";
  const text = total === 0
    ? `${title}\n\n<i>Здесь пока нет материалов.</i>`
    : `${title}\n\nВыберите материал${total > PAGE_SIZE ? ` (стр. ${page + 1}/${Math.ceil(total / PAGE_SIZE)})` : ""}:`;

  if (editMsgId) {
    await editMessage(chatId, editMsgId, text, keyboard);
  } else {
    await sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
  }
}

async function showArticle(chatId: number, articlePrefix: string) {
  const binding = await findChatBinding(chatId);
  if (!binding) return;
  const fullId = await resolvePrefixId("knowledge_articles", binding.workspace_id, articlePrefix);
  if (!fullId) {
    await sendMessage(chatId, "Статья не найдена.");
    return;
  }
  const { data: article } = await service
    .from("knowledge_articles")
    .select("id, title, content, is_public_for_clients, is_published")
    .eq("id", fullId)
    .maybeSingle();

  if (!article || !article.is_public_for_clients || !article.is_published) {
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
}

async function resolvePrefixId(
  table: "knowledge_articles" | "knowledge_groups" | "knowledge_qa" | "folder_slots",
  workspaceId: string,
  prefix: string,
): Promise<string | null> {
  const { data } = await service
    .from(table)
    .select("id")
    .eq("workspace_id", workspaceId)
    .ilike("id", `${prefix}%`)
    .limit(2);
  if (!data || data.length === 0) return null;
  if (data.length > 1) {
    console.warn(`[resolvePrefixId] ambiguous prefix ${prefix} in ${table}`);
    return null;
  }
  return data[0].id;
}

// ═══════════════════════════════════════════════════════════════════════════
// Загрузка документа в слот
// ═══════════════════════════════════════════════════════════════════════════

async function showUploadSlots(chatId: number, from: TgUser | undefined) {
  const binding = await findChatBinding(chatId);
  if (!binding || !from) {
    await sendMessage(chatId, "Группа ещё не привязана к проекту.");
    return;
  }

  const { data: slots } = await service
    .from("folder_slots")
    .select("id, name, folder_id, sort_order, folders(name, sort_order)")
    .eq("project_id", binding.project_id)
    .is("document_id", null)
    .order("sort_order", { ascending: true })
    .limit(50);

  if (!slots || slots.length === 0) {
    await sendMessage(chatId, "В этом проекте нет незаполненных слотов для документов.");
    return;
  }

  const keyboard: TgInlineKeyboard = slots.map((s: {id: string; name: string; folders?: {name: string}}) => [{
    text: `📎 ${s.name}${s.folders?.name ? ` · ${s.folders.name}` : ""}`,
    callback_data: encodeCb({ kind: "upload_slot", slotId: s.id }),
  }]);
  keyboard.push([{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }]);

  await sendMessage(chatId, "<b>Выберите слот, куда загрузить документ:</b>", {
    reply_markup: { inline_keyboard: keyboard },
  });
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

  // add_document_version RPC
  const { error: verErr } = await service.rpc("add_document_version", {
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

  // fill_slot_atomic
  const { error: fillErr } = await service.rpc("fill_slot_atomic", {
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
    { reply_to_message_id: msg.message_id },
  );
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
      await editMessage(chatId, msgId, "<b>Главное меню</b>\n\nВыберите раздел:", [
        [{ text: "📚 База знаний", callback_data: encodeCb({ kind: "kb_group", groupId: null, page: 0 }) }],
        [{ text: "📎 Загрузить документ — напишите /upload" }],
      ]);
      return;
    case "kb_group":
      await answerCallback(cb.id);
      await showKbGroups(chatId, action.groupId, action.page, msgId);
      return;
    case "kb_article":
      await answerCallback(cb.id);
      await showArticle(chatId, action.articleId);
      return;
    case "upload_slot":
      await answerCallback(cb.id);
      await onSlotSelected(chatId, cb.from, action.slotId, msgId);
      return;
    case "upload_cancel":
      await answerCallback(cb.id, "Отменено.");
      await clearSession(chatId, cb.from.id);
      await editMessage(chatId, msgId, "Загрузка отменена.");
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
