/**
 * Edge Function: telegram-webhook
 * Приём сообщений из Telegram и сохранение в БД
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { telegramEntitiesToHtml } from "../_shared/telegramEntitiesToHtml.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");

/**
 * Транслитерация кириллицы и удаление небезопасных символов из имени файла.
 * Supabase Storage не принимает кириллицу в пути — возвращает 400 Invalid key.
 */
function sanitizeFileName(name: string): string {
  const cyrillicMap: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"j",
    к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",
    х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
    А:"A",Б:"B",В:"V",Г:"G",Д:"D",Е:"E",Ё:"Yo",Ж:"Zh",З:"Z",И:"I",Й:"J",
    К:"K",Л:"L",М:"M",Н:"N",О:"O",П:"P",Р:"R",С:"S",Т:"T",У:"U",Ф:"F",
    Х:"Kh",Ц:"Ts",Ч:"Ch",Ш:"Sh",Щ:"Shch",Ъ:"",Ы:"Y",Ь:"",Э:"E",Ю:"Yu",Я:"Ya",
  };
  const ext = name.includes(".") ? "." + name.split(".").pop() : "";
  const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  const transliterated = base.split("").map(c => cyrillicMap[c] ?? c).join("");
  const safe = transliterated.replace(/[^a-zA-Z0-9._\-() ]/g, "_").replace(/\s+/g, "_");
  return safe + ext;
}

// ── Telegram Bot API types (subset used in this webhook) ──

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
}

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
}

interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
}

interface TelegramEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
}

interface TelegramForwardOrigin {
  type: "user" | "hidden_user" | "chat" | "channel";
  date: number;
  sender_user?: TelegramUser;
  sender_user_name?: string; // hidden_user
  sender_chat?: { id: number; title?: string };
  chat?: { id: number; title?: string };
}

interface TelegramMessage {
  chat: { id: number; title?: string };
  message_id: number;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  entities?: TelegramEntity[];
  caption_entities?: TelegramEntity[];
  reply_to_message?: { message_id: number };
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  video?: { file_id: string; file_unique_id: string; mime_type?: string };
  voice?: { file_id: string; file_unique_id: string; mime_type?: string };
  audio?: { file_id: string; file_unique_id: string; file_name?: string; mime_type?: string };
  video_note?: { file_id: string; file_unique_id: string };
  sticker?: { file_id: string; file_unique_id: string; emoji?: string };
  // Пересланные сообщения
  forward_origin?: TelegramForwardOrigin;
  forward_from?: TelegramUser; // deprecated, fallback
  forward_sender_name?: string; // deprecated, fallback
  forward_date?: number; // deprecated, fallback
  // Сервисные сообщения
  new_chat_members?: TelegramUser[];
  left_chat_member?: TelegramUser;
  new_chat_title?: string;
  group_chat_created?: boolean;
  supergroup_chat_created?: boolean;
  migrate_to_chat_id?: number;
  migrate_from_chat_id?: number;
  pinned_message?: TelegramMessage;
}

interface TelegramReactionType {
  type: "emoji" | "custom_emoji";
  emoji?: string;
}

interface TelegramMessageReaction {
  chat: { id: number };
  message_id: number;
  user?: TelegramUser;
  new_reaction?: TelegramReactionType[];
}

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/** Форматирование имени Telegram-пользователя */
function formatTelegramUserName(user: TelegramUser): string {
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || "Пользователь";
}

/** Извлечение информации о пересылке из Telegram-сообщения */
function getForwardInfo(message: TelegramMessage): { name: string | null; date: string | null } {
  if (message.forward_origin) {
    const origin = message.forward_origin;
    const date = new Date(origin.date * 1000).toISOString();
    switch (origin.type) {
      case "user":
        return { name: origin.sender_user ? formatTelegramUserName(origin.sender_user) : null, date };
      case "hidden_user":
        return { name: origin.sender_user_name || "Скрытый пользователь", date };
      case "chat":
      case "channel":
        return { name: origin.sender_chat?.title || origin.chat?.title || null, date };
      default:
        return { name: "Переслано", date };
    }
  }
  if (message.forward_from) {
    const date = message.forward_date ? new Date(message.forward_date * 1000).toISOString() : null;
    return { name: formatTelegramUserName(message.forward_from), date };
  }
  if (message.forward_sender_name) {
    const date = message.forward_date ? new Date(message.forward_date * 1000).toISOString() : null;
    return { name: message.forward_sender_name, date };
  }
  return { name: null, date: null };
}

function getServiceMessageText(message: TelegramMessage): string | null {
  const fromName = message.from ? formatTelegramUserName(message.from) : "Кто-то";

  if (message.group_chat_created || message.supergroup_chat_created) {
    return `${fromName} создал(а) группу` + (message.chat.title ? ` «${message.chat.title}»` : "");
  }

  if (message.new_chat_members && message.new_chat_members.length > 0) {
    const names = message.new_chat_members.map(formatTelegramUserName);
    if (names.length === 1 && message.from?.id === message.new_chat_members[0].id) {
      return `${names[0]} присоединился(-ась) к группе`;
    }
    return `${fromName} добавил(а) ${names.join(", ")}`;
  }

  if (message.left_chat_member) {
    const leftName = formatTelegramUserName(message.left_chat_member);
    if (message.from?.id === message.left_chat_member.id) {
      return `${leftName} покинул(а) группу`;
    }
    return `${fromName} удалил(а) ${leftName}`;
  }

  if (message.new_chat_title) {
    return `${fromName} изменил(а) название группы на «${message.new_chat_title}»`;
  }

  if (message.pinned_message) {
    return `${fromName} закрепил(а) сообщение`;
  }

  if (message.migrate_to_chat_id) {
    return "Группа была преобразована в супергруппу";
  }

  return null;
}

async function sendTelegramMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!TELEGRAM_WEBHOOK_SECRET) {
    console.error("TELEGRAM_WEBHOOK_SECRET is not configured");
    return new Response("Server configuration error", { status: 500 });
  }
  const headerSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (headerSecret !== TELEGRAM_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const update = await req.json();

    if (update.message_reaction) {
      await handleReaction(update.message_reaction);
      return new Response("ok", { status: 200 });
    }

    const isEdited = !!update.edited_message;
    const message = update.message || update.edited_message;
    if (!message) {
      return new Response("ok", { status: 200 });
    }

    const chatId: number = message.chat.id;
    const telegramMessageId: number = message.message_id;
    const from = message.from;
    const rawText: string = message.text || message.caption || "";
    const entities = message.entities || message.caption_entities;
    const text: string = telegramEntitiesToHtml(rawText, entities);
    const replyToTgMsgId: number | null =
      message.reply_to_message?.message_id ?? null;

    if (rawText.startsWith("/")) {
      await handleCommand(chatId, rawText, message);
      return new Response("ok", { status: 200 });
    }

    const { data: tgChat } = await serviceClient
      .from("project_telegram_chats")
      .select("project_id, workspace_id, channel, thread_id")
      .eq("telegram_chat_id", chatId)
      .eq("is_active", true)
      .maybeSingle();

    if (!tgChat) {
      return new Response("ok", { status: 200 });
    }

    const serviceText = getServiceMessageText(message);
    if (serviceText) {
      await serviceClient
        .from("project_messages")
        .insert({
          project_id: tgChat.project_id,
          workspace_id: tgChat.workspace_id,
          sender_participant_id: null,
          sender_name: "Telegram",
          sender_role: null,
          content: serviceText,
          source: "telegram_service",
          channel: tgChat.channel || "client",
          thread_id: tgChat.thread_id ?? undefined,
          telegram_message_id: telegramMessageId,
          telegram_message_ids: [telegramMessageId],
          telegram_chat_id: chatId,
        });

      return new Response("ok", { status: 200 });
    }

    const senderName = [from?.first_name, from?.last_name]
      .filter(Boolean)
      .join(" ");

    if (isEdited) {
      await serviceClient
        .from("project_messages")
        .update({ content: text || rawText, is_edited: true })
        .eq("telegram_message_id", telegramMessageId)
        .eq("telegram_chat_id", chatId);

      return new Response("ok", { status: 200 });
    }

    let senderParticipantId: string | null = null;
    const telegramUserId: number | null = from?.id ?? null;
    if (telegramUserId) {
      const { data: participant } = await serviceClient
        .from("participants")
        .select("id")
        .eq("workspace_id", tgChat.workspace_id)
        .eq("telegram_user_id", telegramUserId)
        .eq("is_deleted", false)
        .maybeSingle();
      if (participant) {
        senderParticipantId = participant.id;
      } else {
        const { data: newParticipant, error: createError } = await serviceClient
          .from("participants")
          .insert({
            workspace_id: tgChat.workspace_id,
            name: from.first_name || "Telegram User",
            last_name: from.last_name || null,
            email: `tg_${telegramUserId}@telegram.placeholder`,
            telegram_user_id: telegramUserId,
            workspace_roles: ["Telegram-контакт"],
            can_login: false,
            is_deleted: false,
          })
          .select("id")
          .single();

        if (createError) {
          if (createError.code === "23505") {
            const { data: existing } = await serviceClient
              .from("participants")
              .select("id")
              .eq("workspace_id", tgChat.workspace_id)
              .eq("telegram_user_id", telegramUserId)
              .eq("is_deleted", false)
              .maybeSingle();
            if (existing) senderParticipantId = existing.id;
          } else {
            console.error("Failed to auto-create telegram contact:", createError);
          }
        } else {
          senderParticipantId = newParticipant.id;
          downloadAndSaveTelegramAvatar(
            telegramUserId,
            newParticipant.id,
            tgChat.workspace_id,
          ).catch((err) =>
            console.error("Failed to download telegram avatar:", err)
          );
        }
      }
    }

    const { data: existingMsg } = await serviceClient
      .from("project_messages")
      .select("id")
      .eq("telegram_message_id", telegramMessageId)
      .eq("telegram_chat_id", chatId)
      .maybeSingle();

    if (existingMsg) {
      return new Response("ok", { status: 200 });
    }

    const forwardInfo = getForwardInfo(message);

    let replyToDbId: string | null = null;
    if (replyToTgMsgId) {
      const { data: replyMsg } = await serviceClient
        .from("project_messages")
        .select("id")
        .eq("project_id", tgChat.project_id)
        .eq("telegram_message_id", replyToTgMsgId)
        .maybeSingle();
      replyToDbId = replyMsg?.id ?? null;
    }

    const { data: inserted } = await serviceClient
      .from("project_messages")
      .insert({
        project_id: tgChat.project_id,
        workspace_id: tgChat.workspace_id,
        sender_participant_id: senderParticipantId,
        sender_name: senderName,
        sender_role: "Telegram",
        content: text || "📎",
        source: "telegram",
        channel: tgChat.channel || "client",
        thread_id: tgChat.thread_id ?? undefined,
        telegram_message_id: telegramMessageId,
        telegram_message_ids: [telegramMessageId],
        telegram_chat_id: chatId,
        reply_to_message_id: replyToDbId,
        forwarded_from_name: forwardInfo.name,
        forwarded_date: forwardInfo.date,
      })
      .select("id")
      .single();

    if (inserted) {
      await handleAttachments(message, inserted.id, tgChat.workspace_id, tgChat.project_id);
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("telegram-webhook error:", error);
    return new Response("ok", { status: 200 });
  }
});

async function downloadAndSaveTelegramAvatar(
  telegramUserId: number,
  participantId: string,
  workspaceId: string,
) {
  const photosRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUserProfilePhotos?user_id=${telegramUserId}&offset=0&limit=1`,
  );
  const photosData = await photosRes.json();

  if (
    !photosData.ok ||
    !photosData.result?.photos?.length ||
    !photosData.result.photos[0]?.length
  ) {
    return;
  }

  const sizes = photosData.result.photos[0];
  const photo = sizes[sizes.length - 1];

  const fileRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${photo.file_id}`,
  );
  const fileData = await fileRes.json();
  if (!fileData.ok || !fileData.result?.file_path) return;

  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
  const downloadRes = await fetch(fileUrl);
  const blob = await downloadRes.blob();

  const storagePath = `${workspaceId}/${participantId}.jpg`;
  const { error: uploadError } = await serviceClient.storage
    .from("participant-avatars")
    .upload(storagePath, blob, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (uploadError) {
    console.error("Avatar upload error:", uploadError);
    return;
  }

  const { data: urlData } = serviceClient.storage
    .from("participant-avatars")
    .getPublicUrl(storagePath);

  await serviceClient
    .from("participants")
    .update({ avatar_url: urlData.publicUrl })
    .eq("id", participantId);
}

async function handleCommand(chatId: number, text: string, message: TelegramMessage) {
  if (text.startsWith("/link ")) {
    const parts = text.split(" ").filter(Boolean);
    const code = parts[1]?.trim()?.toUpperCase();

    if (!code) {
      await sendTelegramMessage(chatId, "Укажите код чата: /link КОД");
      return;
    }

    const { data: projectThread } = await serviceClient
      .from("project_threads")
      .select("id, project_id, workspace_id, name, legacy_channel")
      .eq("link_code", code)
      .maybeSingle();

    let targetThreadId: string | null = null;
    let targetProjectId: string;
    let targetWorkspaceId: string;
    let targetChannel: string;
    let threadName: string;

    if (projectThread) {
      targetThreadId = projectThread.id;
      targetProjectId = projectThread.project_id;
      targetWorkspaceId = projectThread.workspace_id;
      targetChannel = projectThread.legacy_channel || "client";
      threadName = projectThread.name;
    } else {
      const channelArg = parts[2]?.trim()?.toLowerCase();
      const channel = channelArg === "internal" ? "internal" : "client";

      const { data: project } = await serviceClient
        .from("projects")
        .select("id, workspace_id")
        .eq("messenger_link_code", code)
        .maybeSingle();

      if (!project) {
        await sendTelegramMessage(chatId, "Чат с таким кодом не найден.");
        return;
      }

      const { data: legacyThread } = await serviceClient
        .from("project_threads")
        .select("id")
        .eq("project_id", project.id)
        .eq("legacy_channel", channel)
        .maybeSingle();

      targetThreadId = legacyThread?.id ?? null;
      targetProjectId = project.id;
      targetWorkspaceId = project.workspace_id;
      targetChannel = channel;
      threadName = channel === "internal" ? "Команда" : "Клиенты";
    }

    const { data: existing } = targetThreadId
      ? await serviceClient
          .from("project_telegram_chats")
          .select("id")
          .eq("thread_id", targetThreadId)
          .maybeSingle()
      : await serviceClient
          .from("project_telegram_chats")
          .select("id")
          .eq("project_id", targetProjectId)
          .eq("channel", targetChannel)
          .maybeSingle();

    if (existing) {
      await serviceClient
        .from("project_telegram_chats")
        .update({
          telegram_chat_id: chatId,
          telegram_chat_title: message.chat.title ?? null,
          thread_id: targetThreadId,
          is_active: true,
        })
        .eq("id", existing.id);
    } else {
      await serviceClient.from("project_telegram_chats").insert({
        project_id: targetProjectId,
        workspace_id: targetWorkspaceId,
        telegram_chat_id: chatId,
        telegram_chat_title: message.chat.title ?? null,
        channel: targetChannel,
        thread_id: targetThreadId,
        is_active: true,
      });
    }

    await sendTelegramMessage(chatId, `Группа привязана к чату «${threadName}»!`);

    try {
      const botId = TELEGRAM_BOT_TOKEN.split(":")[0];
      const res = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChatMember?chat_id=${chatId}&user_id=${botId}`,
      );
      const data = await res.json();
      const status = data?.result?.status;
      if (status !== "administrator" && status !== "creator") {
        await sendTelegramMessage(
          chatId,
          "⚠️ Для синхронизации реакций сделайте бота администратором группы.",
        );
      }
    } catch {
      // Not critical
    }
  } else if (text === "/unlink") {
    const { data: tgChat } = await serviceClient
      .from("project_telegram_chats")
      .select("id")
      .eq("telegram_chat_id", chatId)
      .eq("is_active", true)
      .maybeSingle();

    if (tgChat) {
      await serviceClient
        .from("project_telegram_chats")
        .update({ is_active: false })
        .eq("id", tgChat.id);
      await sendTelegramMessage(chatId, "Группа отвязана от проекта.");
    } else {
      await sendTelegramMessage(chatId, "Эта группа не привязана ни к одному проекту.");
    }
  } else if (text === "/start") {
    await sendTelegramMessage(
      chatId,
      "Привет! Я бот для связи с проектом.\n\n" +
        "Команды:\n" +
        "/link КОД — привязать группу к чату (код из настроек чата)\n" +
        "/unlink — отвязать группу от проекта"
    );
  }
}

async function handleAttachments(
  message: TelegramMessage,
  messageId: string,
  workspaceId: string,
  projectId: string,
) {
  const files: { fileId: string; originalName: string; safeFileName: string; mimeType: string }[] = [];

  if (message.photo && message.photo.length > 0) {
    const photo = message.photo[message.photo.length - 1];
    const name = `photo_${photo.file_unique_id}.jpg`;
    files.push({ fileId: photo.file_id, originalName: name, safeFileName: name, mimeType: "image/jpeg" });
  }

  if (message.document) {
    const origName = message.document.file_name || `document_${message.document.file_unique_id}`;
    files.push({
      fileId: message.document.file_id,
      originalName: origName,
      safeFileName: sanitizeFileName(origName),
      mimeType: message.document.mime_type || "application/octet-stream",
    });
  }

  if (message.voice) {
    const name = `voice_${message.voice.file_unique_id}.ogg`;
    files.push({ fileId: message.voice.file_id, originalName: name, safeFileName: name, mimeType: message.voice.mime_type || "audio/ogg" });
  }

  if (message.audio) {
    const origName = message.audio.file_name || `audio_${message.audio.file_unique_id}`;
    files.push({
      fileId: message.audio.file_id,
      originalName: origName,
      safeFileName: sanitizeFileName(origName),
      mimeType: message.audio.mime_type || "audio/mpeg",
    });
  }

  if (message.video) {
    const name = `video_${message.video.file_unique_id}.mp4`;
    files.push({ fileId: message.video.file_id, originalName: name, safeFileName: name, mimeType: message.video.mime_type || "video/mp4" });
  }

  if (message.video_note) {
    const name = `videonote_${message.video_note.file_unique_id}.mp4`;
    files.push({ fileId: message.video_note.file_id, originalName: name, safeFileName: name, mimeType: "video/mp4" });
  }

  const skippedFiles: string[] = [];
  for (const file of files) {
    try {
      const fileInfoRes = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${file.fileId}`,
      );
      const fileInfo = await fileInfoRes.json();

      if (!fileInfo.ok || !fileInfo.result?.file_path) {
        skippedFiles.push(file.originalName);
        continue;
      }

      const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileInfo.result.file_path}`;
      const fileRes = await fetch(fileUrl);
      const fileBuffer = await fileRes.arrayBuffer();

      const storagePath = `${workspaceId}/${projectId}/${messageId}/${file.safeFileName}`;
      const { error: uploadError } = await serviceClient.storage
        .from("files")
        .upload(storagePath, fileBuffer, {
          contentType: file.mimeType,
          upsert: false,
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError, "path:", storagePath);
        continue;
      }

      const { data: filesRecord, error: filesError } = await serviceClient
        .from("files")
        .insert({
          workspace_id: workspaceId,
          bucket: "files",
          storage_path: storagePath,
          file_name: file.originalName,
          file_size: fileBuffer.byteLength,
          mime_type: file.mimeType,
        })
        .select("id")
        .single();

      if (filesError) {
        console.error("Error creating files record:", filesError);
        continue;
      }

      await serviceClient.from("message_attachments").insert({
        message_id: messageId,
        file_name: file.originalName,
        file_size: fileBuffer.byteLength,
        mime_type: file.mimeType,
        storage_path: storagePath,
        telegram_file_id: file.fileId,
        file_id: filesRecord.id,
      });
    } catch (err) {
      console.error("Error processing attachment:", err);
    }
  }

  if (skippedFiles.length > 0) {
    const { data: msg } = await serviceClient
      .from("project_messages")
      .select("content")
      .eq("id", messageId)
      .single();

    const warning = skippedFiles.length === 1
      ? `\n\n⚠️ Файл «${skippedFiles[0]}» слишком большой (макс. 20 МБ через Telegram)`
      : `\n\n⚠️ Файлы слишком большие (макс. 20 МБ через Telegram):\n${skippedFiles.map((n) => `• ${n}`).join("\n")}`;

    await serviceClient
      .from("project_messages")
      .update({ content: (msg?.content || "") + warning })
      .eq("id", messageId);
  }
}

async function handleReaction(reaction: TelegramMessageReaction) {
  const chatId: number = reaction.chat.id;
  const telegramMessageId: number = reaction.message_id;
  const telegramUserId: number = reaction.user?.id;
  const telegramUserName: string = [reaction.user?.first_name, reaction.user?.last_name]
    .filter(Boolean)
    .join(" ") || "Telegram User";

  if (!telegramUserId) return;

  // Ищем исходное сообщение по массиву telegram_message_ids.
  // Одна запись в project_messages может соответствовать нескольким TG-сообщениям
  // (текст + каждый файл как отдельное сообщение в Telegram).
  const { data: msg } = await serviceClient
    .from("project_messages")
    .select("id, workspace_id")
    .eq("telegram_chat_id", chatId)
    .contains("telegram_message_ids", [telegramMessageId])
    .maybeSingle();

  const newEmojis: string[] = (reaction.new_reaction ?? [])
    .filter((r: TelegramReactionType) => r.type === "emoji")
    .map((r: TelegramReactionType) => r.emoji!);

  // Если сообщение не нашлось — просто игнорируем реакцию.
  // Раньше здесь был fallback, который создавал «паразитное» сообщение с эмодзи.
  // Он засорял чат, поэтому удалён.
  if (!msg) return;

  let participantId: string | null = null;
  const { data: participant } = await serviceClient
    .from("participants")
    .select("id")
    .eq("workspace_id", msg.workspace_id)
    .eq("telegram_user_id", telegramUserId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (participant) {
    participantId = participant.id;
  }

  // Удаляем реакции только на конкретное TG-сообщение (telegramMessageId), а не все
  // реакции юзера на наш общий project_messages — иначе реакция на один элемент
  // бабла (например, файл) затирает реакцию на другой (например, текст).
  await serviceClient
    .from("message_reactions")
    .delete()
    .eq("message_id", msg.id)
    .eq("telegram_user_id", telegramUserId)
    .eq("telegram_source_message_id", telegramMessageId);

  if (newEmojis.length > 0) {
    const rows = newEmojis.map((emoji: string) => ({
      message_id: msg.id,
      participant_id: participantId,
      telegram_user_id: telegramUserId,
      telegram_user_name: telegramUserName,
      emoji,
      telegram_source_message_id: telegramMessageId,
    }));

    const { error } = await serviceClient
      .from("message_reactions")
      .insert(rows);

    if (error) {
      console.error("Error saving telegram reactions:", error);
    }
  }
}
