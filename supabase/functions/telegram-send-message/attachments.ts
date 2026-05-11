/**
 * Отправка вложений в Telegram — фото, документы, медиа-группы.
 * Вынесено из index.ts (1089 → ~600 строк) для лучшего разделения
 * ответственности: главный handler делает auth/validation/text, этот модуль
 * делает Telegram Media API.
 *
 * Поведение НЕ меняется относительно оригинала. Только перенос места.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { escapeHtmlEntities } from "../_shared/htmlFormatting.ts";
import { resolveBotToken } from "../_shared/telegramBotToken.ts";
import { isTelegramPhotoMime } from "./helpers.ts";

export async function resolveAttachment(
  att: Record<string, unknown>,
  supabaseClient: ReturnType<typeof createClient>,
): Promise<{ blob: Blob; fileName: string; mimeType: string | null } | null> {
  try {
    let bucket = "message-attachments";
    let storagePath = att.storage_path as string;
    if (att.file_id) {
      const { data: fileRecord } = await supabaseClient
        .from("files")
        .select("bucket, storage_path")
        .eq("id", att.file_id)
        .single();
      if (fileRecord) {
        bucket = fileRecord.bucket;
        storagePath = fileRecord.storage_path;
      }
    }

    const { data: urlData } = await supabaseClient.storage
      .from(bucket)
      .createSignedUrl(storagePath, 300);

    if (!urlData?.signedUrl) {
      console.error("resolveAttachment: no signedUrl for", att.file_name, "bucket:", bucket, "path:", storagePath);
      return null;
    }

    const fileRes = await fetch(urlData.signedUrl);
    if (!fileRes.ok) {
      console.error("resolveAttachment: fetch failed", fileRes.status, "for", att.file_name);
      return null;
    }
    const blob = await fileRes.blob();
    return { blob, fileName: att.file_name as string, mimeType: (att.mime_type as string) ?? null };
  } catch (err) {
    console.error("resolveAttachment error for", att.file_name, ":", err);
    return null;
  }
}

/**
 * Wrapper над sendAttachments: при ошибке отправки через личный бот сотрудника
 * (его нет в группе → Telegram возвращает «bot is not a member of the group
 * chat»), повторяет отправку через бот-секретаря этой группы. По аналогии с
 * текстовой веткой, которая тоже fallback'ит.
 *
 * Если caption присутствовал у personal-bot попытки — у secretary-бота
 * добавляем префикс «<Имя>:», чтобы получатель понимал автора.
 */
export async function sendAttachmentsWithFallback(
  args: {
    messageId: string;
    chatId: number;
    supabaseClient: ReturnType<typeof createClient>;
    primaryToken: string;
    caption?: string;
    replyTo?: number;
    skipIdUpdate?: boolean;
    isEmployeeBot: boolean;
    senderName?: string;
  },
): Promise<boolean> {
  console.log(JSON.stringify({
    sub: "sendAttachmentsWithFallback",
    message_id: args.messageId,
    event: "primary.start",
    is_employee_bot: args.isEmployeeBot,
    primary_token_prefix: args.primaryToken.slice(0, 8),
    has_caption: !!args.caption,
  }));
  const ok = await sendAttachments(
    args.messageId, args.chatId, args.supabaseClient,
    args.primaryToken, args.caption, args.replyTo, args.skipIdUpdate ?? false,
  );
  console.log(JSON.stringify({
    sub: "sendAttachmentsWithFallback",
    message_id: args.messageId,
    event: "primary.result",
    ok,
    will_fallback: !ok && args.isEmployeeBot,
  }));
  if (ok || !args.isEmployeeBot) return ok;

  console.warn("[telegram-send-message] employee bot attachments send failed, falling back to secretary");
  // Пишем причину fallback'а в БД для post-mortem через SQL.
  const attachmentsFallbackDetail = `employee_bot_attachments_failed; reply=${args.replyTo ?? "no"}; via=attachments`;
  await args.supabaseClient
    .from("project_messages")
    .update({ telegram_error_detail: attachmentsFallbackDetail })
    .eq("id", args.messageId);
  let fallback;
  try {
    fallback = await resolveBotToken(args.supabaseClient, args.chatId);
  } catch (e) {
    console.error("[telegram-send-message] secretary token resolve failed:", e);
    return false;
  }
  console.log(JSON.stringify({
    sub: "sendAttachmentsWithFallback",
    message_id: args.messageId,
    event: "fallback.start",
    fallback_token_len: fallback.token.length,
  }));

  const fallbackCaption = args.caption
    ? `<b>${escapeHtmlEntities(args.senderName ?? "")}:</b>\n${args.caption}`
    : args.caption;

  const fallbackOk = await sendAttachments(
    args.messageId, args.chatId, args.supabaseClient,
    fallback.token, fallbackCaption, args.replyTo, args.skipIdUpdate ?? false,
  );
  console.log(JSON.stringify({
    sub: "sendAttachmentsWithFallback",
    message_id: args.messageId,
    event: "fallback.result",
    ok: fallbackOk,
  }));
  return fallbackOk;
}

export async function sendAttachments(
  messageId: string,
  chatId: number,
  supabaseClient: ReturnType<typeof createClient>,
  botToken: string,
  caption?: string,
  replyToTelegramMessageId?: number,
  skipTelegramIdUpdate = false,
): Promise<boolean> {
  const sendStart = Date.now();
  const sendTrace = (event: string, data: Record<string, unknown> = {}) => {
    console.log(JSON.stringify({
      sub: "sendAttachments",
      message_id: messageId,
      chat_id: chatId,
      token_prefix: botToken.slice(0, 8),
      elapsed_ms: Date.now() - sendStart,
      event,
      ...data,
    }));
  };

  const { data: attachments } = await supabaseClient
    .from("message_attachments")
    .select("*")
    .eq("message_id", messageId);

  if (!attachments || attachments.length === 0) {
    sendTrace("no_attachments_in_db");
    await supabaseClient
      .from("project_messages")
      .update({ telegram_error_detail: "sendAttachments: no attachments found in DB" })
      .eq("id", messageId);
    return false;
  }

  let allSucceeded = true;

  // Только JPEG/PNG/WEBP/GIF уходят как photo в Telegram.
  // Всё остальное (tiff, heic, bmp, svg, pdf, docs, ...) — как document.
  const images = attachments.filter((a: Record<string, unknown>) => isTelegramPhotoMime(a.mime_type));
  const others = attachments.filter((a: Record<string, unknown>) => !isTelegramPhotoMime(a.mime_type));

  sendTrace("attachments.partition", {
    total: attachments.length,
    images: images.length,
    others: others.length,
    mimes: attachments.map((a: Record<string, unknown>) => a.mime_type),
  });

  if (images.length >= 2) {
    const chunks: typeof images[] = [];
    for (let i = 0; i < images.length; i += 10) {
      chunks.push(images.slice(i, i + 10));
    }

    let isFirstChunk = true;
    for (const chunk of chunks) {
      try {
        const resolved = await Promise.all(chunk.map((a: Record<string, unknown>) => resolveAttachment(a, supabaseClient)));

        const formData = new FormData();
        formData.append("chat_id", String(chatId));

        const media: Record<string, unknown>[] = [];
        resolved.forEach((r: { blob: Blob; fileName: string; mimeType: string | null } | null, idx: number) => {
          if (!r) return;
          const attachKey = `attach_${idx}`;
          formData.append(attachKey, r.blob, r.fileName);
          const item: Record<string, unknown> = {
            type: "photo",
            media: `attach://${attachKey}`,
          };
          if (isFirstChunk && idx === 0 && caption) {
            item.caption = caption.slice(0, 1024);
            item.parse_mode = "HTML";
          }
          media.push(item);
        });

        formData.append("media", JSON.stringify(media));

        if (isFirstChunk && replyToTelegramMessageId) {
          formData.append("reply_parameters", JSON.stringify({
            message_id: replyToTelegramMessageId,
          }));
        }

        const fetchStart = Date.now();
        sendTrace("sendMediaGroup.start", { chunk_size: chunk.length, is_first: isFirstChunk });
        const tgResult = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMediaGroup`,
          { method: "POST", body: formData },
        );

        const tgData = await tgResult.json();
        sendTrace("sendMediaGroup.response", {
          http_status: tgResult.status,
          api_ok: tgData.ok,
          error_code: tgData.error_code ?? null,
          description: tgData.description ?? null,
          duration_ms: Date.now() - fetchStart,
        });
        if (!tgData.ok) {
          console.error("Telegram sendMediaGroup error:", JSON.stringify(tgData));
          allSucceeded = false;
        }

        if (isFirstChunk && !skipTelegramIdUpdate && tgData.ok) {
          const firstMsgId = Array.isArray(tgData.result) ? tgData.result[0]?.message_id : null;
          if (firstMsgId) {
            await supabaseClient
              .from("project_messages")
              .update({ telegram_message_id: firstMsgId, telegram_chat_id: chatId })
              .eq("id", messageId);
          }
        }
        // Добавляем в telegram_message_ids все id медиа-группы (не только первый),
        // чтобы реакция на любой элемент группы нашла исходник.
        if (!skipTelegramIdUpdate && tgData.ok && Array.isArray(tgData.result)) {
          for (const item of tgData.result) {
            if (item?.message_id) {
              await supabaseClient.rpc("append_telegram_message_id", {
                p_message_id: messageId,
                p_tg_msg_id: item.message_id,
                p_chat_id: chatId,
              });
            }
          }
        }

        isFirstChunk = false;
      } catch (err) {
        console.error("Error sending media group to TG:", err);
        allSucceeded = false;
      }
    }
  } else if (images.length === 1) {
    try {
      const r = await resolveAttachment(images[0], supabaseClient);
      if (r) {
        const formData = new FormData();
        formData.append("chat_id", String(chatId));
        formData.append("photo", r.blob, r.fileName);
        if (caption) {
          formData.append("caption", caption.slice(0, 1024));
          formData.append("parse_mode", "HTML");
        }
        if (replyToTelegramMessageId) {
          formData.append("reply_parameters", JSON.stringify({ message_id: replyToTelegramMessageId }));
        }

        const fetchStart = Date.now();
        sendTrace("sendPhoto.start");
        const tgResult = await fetch(
          `https://api.telegram.org/bot${botToken}/sendPhoto`,
          { method: "POST", body: formData },
        );

        const tgData = await tgResult.json();
        sendTrace("sendPhoto.response", {
          http_status: tgResult.status,
          api_ok: tgData.ok,
          error_code: tgData.error_code ?? null,
          description: tgData.description ?? null,
          duration_ms: Date.now() - fetchStart,
        });
        if (!tgData.ok) {
          console.error("Telegram sendPhoto error:", JSON.stringify(tgData));
          allSucceeded = false;
        }

        if (!skipTelegramIdUpdate && tgData.ok && tgData.result?.message_id) {
          await supabaseClient
            .from("project_messages")
            .update({ telegram_message_id: tgData.result.message_id, telegram_chat_id: chatId })
            .eq("id", messageId);
        }
      }
    } catch (err) {
      console.error("Error sending photo to TG:", err);
      allSucceeded = false;
    }
  }

  // Документы: 2+ файла отправляем одним альбомом (sendMediaGroup type=document),
  // чтобы в TG получился один баббл. Один файл — обычный sendDocument с caption.
  const documentsCaptionAvailable = images.length === 0 ? caption : undefined;
  const documentsReplyTo = images.length === 0 ? replyToTelegramMessageId : undefined;

  if (others.length >= 2) {
    // Telegram API: media group принимает 2-10 элементов. Бьём на чанки по 10.
    const chunks: typeof others[] = [];
    for (let i = 0; i < others.length; i += 10) {
      chunks.push(others.slice(i, i + 10));
    }

    let isFirstChunk = true;
    for (const chunk of chunks) {
      try {
        const resolved = await Promise.all(chunk.map((a) => resolveAttachment(a, supabaseClient)));

        const nullCount = resolved.filter((r) => !r).length;
        if (nullCount > 0) {
          await supabaseClient
            .from("project_messages")
            .update({ telegram_error_detail: `sendMediaGroup(document): ${nullCount}/${resolved.length} attachments failed to resolve` })
            .eq("id", messageId);
        }

        const formData = new FormData();
        formData.append("chat_id", String(chatId));

        const media: Record<string, unknown>[] = [];
        resolved.forEach((r, idx) => {
          if (!r) return;
          const attachKey = `attach_doc_${idx}`;
          formData.append(attachKey, r.blob, r.fileName);
          const item: Record<string, unknown> = {
            type: "document",
            media: `attach://${attachKey}`,
          };
          if (isFirstChunk && idx === 0 && documentsCaptionAvailable) {
            item.caption = documentsCaptionAvailable.slice(0, 1024);
            item.parse_mode = "HTML";
          }
          media.push(item);
        });

        formData.append("media", JSON.stringify(media));

        if (isFirstChunk && documentsReplyTo) {
          formData.append("reply_parameters", JSON.stringify({ message_id: documentsReplyTo }));
        }

        const fetchStart = Date.now();
        sendTrace("sendMediaGroup.docs.start", { chunk_size: chunk.length, is_first: isFirstChunk });
        const tgResult = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMediaGroup`,
          { method: "POST", body: formData },
        );

        const tgData = await tgResult.json();
        sendTrace("sendMediaGroup.docs.response", {
          http_status: tgResult.status,
          api_ok: tgData.ok,
          error_code: tgData.error_code ?? null,
          description: tgData.description ?? null,
          duration_ms: Date.now() - fetchStart,
        });
        if (!tgData.ok) {
          console.error("Telegram sendMediaGroup (document) error:", JSON.stringify(tgData));
          allSucceeded = false;
          await supabaseClient
            .from("project_messages")
            .update({ telegram_error_detail: `sendMediaGroup(document): ${JSON.stringify(tgData).slice(0, 500)}` })
            .eq("id", messageId);
        }

        if (isFirstChunk && !skipTelegramIdUpdate && images.length === 0 && tgData.ok) {
          const firstMsgId = Array.isArray(tgData.result) ? tgData.result[0]?.message_id : null;
          if (firstMsgId) {
            await supabaseClient
              .from("project_messages")
              .update({ telegram_message_id: firstMsgId, telegram_chat_id: chatId })
              .eq("id", messageId);
          }
        }
        if (!skipTelegramIdUpdate && tgData.ok && Array.isArray(tgData.result)) {
          for (const item of tgData.result) {
            if (item?.message_id) {
              await supabaseClient.rpc("append_telegram_message_id", {
                p_message_id: messageId,
                p_tg_msg_id: item.message_id,
                p_chat_id: chatId,
              });
            }
          }
        }

        isFirstChunk = false;
      } catch (err) {
        console.error("Error sending document group to TG:", err);
        allSucceeded = false;
      }
    }
  } else if (others.length === 1) {
    // Один документ — обычный sendDocument с caption.
    try {
      const r = await resolveAttachment(others[0], supabaseClient);
      if (!r) {
        allSucceeded = false;
      } else {
        const formData = new FormData();
        formData.append("chat_id", String(chatId));
        formData.append("document", r.blob, r.fileName);

        if (documentsCaptionAvailable) {
          formData.append("caption", documentsCaptionAvailable.slice(0, 1024));
          formData.append("parse_mode", "HTML");
        }
        if (documentsReplyTo) {
          formData.append("reply_parameters", JSON.stringify({ message_id: documentsReplyTo }));
        }

        const fetchStart = Date.now();
        sendTrace("sendDocument.start", { file_name: r.fileName });
        const tgResult = await fetch(
          `https://api.telegram.org/bot${botToken}/sendDocument`,
          { method: "POST", body: formData },
        );

        const tgData = await tgResult.json();
        sendTrace("sendDocument.response", {
          http_status: tgResult.status,
          api_ok: tgData.ok,
          error_code: tgData.error_code ?? null,
          description: tgData.description ?? null,
          duration_ms: Date.now() - fetchStart,
          file_name: r.fileName,
        });
        if (!tgData.ok) {
          console.error("Telegram sendDocument error:", JSON.stringify(tgData), "file:", r.fileName);
          allSucceeded = false;
        }

        if (!skipTelegramIdUpdate && images.length === 0 && tgData.ok && tgData.result?.message_id) {
          await supabaseClient
            .from("project_messages")
            .update({ telegram_message_id: tgData.result.message_id, telegram_chat_id: chatId })
            .eq("id", messageId);
        }
        if (!skipTelegramIdUpdate && tgData.ok && tgData.result?.message_id) {
          await supabaseClient.rpc("append_telegram_message_id", {
            p_message_id: messageId,
            p_tg_msg_id: tgData.result.message_id,
            p_chat_id: chatId,
          });
        }
      }
    } catch (err) {
      console.error("Error sending document to TG:", err);
      allSucceeded = false;
    }
  }

  return allSucceeded;
}
