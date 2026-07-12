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
import { storageCreateSignedUrl } from "../_shared/storage.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Какие категории вложений слать (для гранулярного повтора/фолбэка). */
type AttachmentCategory = "images" | "documents";

/**
 * Результат sendAttachments по КАТЕГОРИЯМ. Нужен, чтобы при частичном провале
 * (например, фото ушли, а документ упал) повторять/фолбэчить ТОЛЬКО упавшую
 * часть, а не пересылать всё заново (иначе дублируются уже доставленные фото —
 * баг 2026-06-26). `had*` = были ли вложения этого типа вообще.
 */
type SendAttachmentsResult = {
  imagesOk: boolean;
  documentsOk: boolean;
  hadImages: boolean;
  hadDocuments: boolean;
};

/**
 * Прикрепляет reply_parameters к formData исходящего вложения (нативная цитата
 * в Telegram). Единая точка для ВСЕХ веток отправки (фото/альбом/документ) —
 * формат reply_parameters и truthy-гейт живут в одном месте, чтобы 4 ветки не
 * расходились (см. ledger — класс бага «рассинхрон копий reply при отправке»).
 */
function appendReplyParam(
  formData: FormData,
  replyToTelegramMessageId: number | null | undefined,
): void {
  if (replyToTelegramMessageId) {
    formData.append("reply_parameters", JSON.stringify({ message_id: replyToTelegramMessageId }));
  }
}

export async function resolveAttachment(
  att: Record<string, unknown>,
  supabaseClient: ReturnType<typeof createClient>,
): Promise<{ blob: Blob; fileName: string; mimeType: string | null } | null> {
  let bucket = "message-attachments";
  let storagePath = att.storage_path as string;
  try {
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
  } catch (err) {
    console.error("resolveAttachment: file lookup failed for", att.file_name, ":", err);
  }

  // Retry до 3 раз с экспоненциальной задержкой: транзиентные сбои Storage/CDN
  // приводили к «1/N attachments failed to resolve» и потере части файлов в TG.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data: urlData } = await storageCreateSignedUrl(supabaseClient, bucket, storagePath, 600);

      if (!urlData?.signedUrl) {
        console.error("resolveAttachment: no signedUrl for", att.file_name, "attempt", attempt + 1);
      } else {
        const fileRes = await fetch(urlData.signedUrl);
        if (fileRes.ok) {
          const blob = await fileRes.blob();
          return {
            blob,
            fileName: att.file_name as string,
            mimeType: (att.mime_type as string) ?? null,
          };
        }
        console.error("resolveAttachment: fetch failed", fileRes.status, "for", att.file_name, "attempt", attempt + 1);
      }
    } catch (err) {
      console.error("resolveAttachment error for", att.file_name, "attempt", attempt + 1, ":", err);
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  return null;
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
  const trace = (event: string, data: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ sub: "sendAttachmentsWithFallback", message_id: args.messageId, event, ...data }));

  // Категории, которые НЕ удалось доставить (по ним и будем повторять/фолбэчить).
  const failedCats = (r: SendAttachmentsResult): AttachmentCategory[] => {
    const out: AttachmentCategory[] = [];
    if (r.hadImages && !r.imagesOk) out.push("images");
    if (r.hadDocuments && !r.documentsOk) out.push("documents");
    return out;
  };

  trace("primary.start", {
    is_employee_bot: args.isEmployeeBot,
    primary_token_prefix: args.primaryToken.slice(0, 8),
    has_caption: !!args.caption,
  });
  const primary = await sendAttachments(
    args.messageId, args.chatId, args.supabaseClient,
    args.primaryToken, args.caption, args.replyTo, args.skipIdUpdate ?? false,
  );
  trace("primary.result", { ...primary });

  // Ничего слать не получилось (нет вложений в БД) — это ошибка.
  if (!primary.hadImages && !primary.hadDocuments) return false;

  let failed = failedCats(primary);
  if (failed.length === 0) return true;

  // ── Шаг 1: повтор УПАВШЕЙ части ТЕМ ЖЕ ботом. Частые провалы (rate-limit
  // после альбома, транзиентка) лечатся повтором, и сообщение остаётся от
  // одного бота — без дубля уже доставленного и без префикса секретаря. ──
  await sleep(2000);
  for (const cat of [...failed]) {
    trace("retry.same_bot.start", { category: cat });
    const rr = await sendAttachments(
      args.messageId, args.chatId, args.supabaseClient,
      args.primaryToken, args.caption, args.replyTo, args.skipIdUpdate ?? false, cat,
    );
    const catOk = cat === "images" ? rr.imagesOk : rr.documentsOk;
    trace("retry.same_bot.result", { category: cat, ok: catOk });
    if (catOk) failed = failed.filter((c) => c !== cat);
  }
  if (failed.length === 0) return true;

  // Если слали уже секретарём (не личным) — другого бота нет, выходим.
  if (!args.isEmployeeBot) return false;

  // ── Шаг 2: фолбэк на бота-секретаря ТОЛЬКО для всё ещё упавших категорий
  // (личный бот не в группе и т.п.). Картинки, что уже ушли личным, повторно
  // НЕ шлём — нет дубля. ──
  await args.supabaseClient
    .from("project_messages")
    .update({ telegram_error_detail: `employee_bot_attachments_failed; cats=${failed.join(",")}; via=attachments` })
    .eq("id", args.messageId);
  let secretary;
  try {
    secretary = await resolveBotToken(args.supabaseClient, args.chatId);
  } catch (e) {
    console.error("[telegram-send-message] secretary token resolve failed:", e);
    return false;
  }
  const fallbackCaption = args.caption
    ? `<b>${escapeHtmlEntities(args.senderName ?? "")}:</b>\n${args.caption}`
    : args.caption;

  let allOk = true;
  for (const cat of failed) {
    trace("fallback.secretary.start", { category: cat });
    const rr = await sendAttachments(
      args.messageId, args.chatId, args.supabaseClient,
      secretary.token, fallbackCaption, args.replyTo, args.skipIdUpdate ?? false, cat,
    );
    const catOk = cat === "images" ? rr.imagesOk : rr.documentsOk;
    trace("fallback.secretary.result", { category: cat, ok: catOk });
    if (!catOk) allOk = false;
  }
  return allOk;
}

export async function sendAttachments(
  messageId: string,
  chatId: number,
  supabaseClient: ReturnType<typeof createClient>,
  botToken: string,
  caption?: string,
  replyToTelegramMessageId?: number,
  skipTelegramIdUpdate = false,
  // Если задано — слать только эту категорию (для гранулярного повтора/фолбэка).
  only?: AttachmentCategory,
): Promise<SendAttachmentsResult> {
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
    return { imagesOk: false, documentsOk: false, hadImages: false, hadDocuments: false };
  }

  // Только JPEG/PNG/WEBP/GIF уходят как photo в Telegram.
  // Всё остальное (tiff, heic, bmp, svg, pdf, docs, ...) — как document.
  const images = attachments.filter((a: Record<string, unknown>) => isTelegramPhotoMime(a.mime_type));
  const others = attachments.filter((a: Record<string, unknown>) => !isTelegramPhotoMime(a.mime_type));

  // Раздельные флаги по категориям. Пропущенная (через `only`) категория
  // остаётся true — она не считается упавшей.
  let imagesOk = true;
  let documentsOk = true;
  const doImages = only !== "documents";
  const doDocuments = only !== "images";

  sendTrace("attachments.partition", {
    total: attachments.length,
    images: images.length,
    others: others.length,
    mimes: attachments.map((a: Record<string, unknown>) => a.mime_type),
  });

  if (doImages && images.length >= 2) {
    const chunks: typeof images[] = [];
    for (let i = 0; i < images.length; i += 10) {
      chunks.push(images.slice(i, i + 10));
    }

    let isFirstChunk = true;
    for (const chunk of chunks) {
      try {
        const resolved = await Promise.all(chunk.map((a: Record<string, unknown>) => resolveAttachment(a, supabaseClient)));

        const nullCount = resolved.filter((r) => !r).length;
        if (nullCount > 0) {
          imagesOk = false;
          await supabaseClient
            .from("project_messages")
            .update({ telegram_error_detail: `sendMediaGroup(photo): ${nullCount}/${resolved.length} attachments failed to resolve` })
            .eq("id", messageId);
        }

        const formData = new FormData();
        formData.append("chat_id", String(chatId));

        const media: Record<string, unknown>[] = [];
        // Параллельный массив id вложений — media[k]/result[k] ↔ mediaAttachmentIds[k]
        // (порядок sendMediaGroup гарантирован). Нужен для per-file удаления.
        const mediaAttachmentIds: string[] = [];
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
          mediaAttachmentIds.push(chunk[idx].id as string);
        });

        formData.append("media", JSON.stringify(media));

        if (isFirstChunk) appendReplyParam(formData, replyToTelegramMessageId);

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
          imagesOk = false;
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

        // Per-file id: адрес каждого фото в Telegram — для точечного удаления
        // одного файла из альбома. Отдельная колонка message_attachments, пишем
        // на успехе всегда (в т.ч. в split-text/skip-режиме — конфликта нет).
        if (tgData.ok && Array.isArray(tgData.result)) {
          for (let k = 0; k < tgData.result.length; k++) {
            const tgMsgId = tgData.result[k]?.message_id;
            const attId = mediaAttachmentIds[k];
            if (tgMsgId && attId) {
              await supabaseClient
                .from("message_attachments")
                .update({ telegram_message_id: tgMsgId })
                .eq("id", attId);
            }
          }
        }

        isFirstChunk = false;
      } catch (err) {
        console.error("Error sending media group to TG:", err);
        imagesOk = false;
      }
    }
  } else if (doImages && images.length === 1) {
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
        appendReplyParam(formData, replyToTelegramMessageId);

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
          imagesOk = false;
        }

        if (!skipTelegramIdUpdate && tgData.ok && tgData.result?.message_id) {
          await supabaseClient
            .from("project_messages")
            .update({ telegram_message_id: tgData.result.message_id, telegram_chat_id: chatId })
            .eq("id", messageId);
        }

        // Per-file id для точечного удаления одного файла в канале.
        if (tgData.ok && tgData.result?.message_id) {
          await supabaseClient
            .from("message_attachments")
            .update({ telegram_message_id: tgData.result.message_id })
            .eq("id", (images[0] as Record<string, unknown>).id as string);
        }
      }
    } catch (err) {
      console.error("Error sending photo to TG:", err);
      imagesOk = false;
    }
  }

  // Документы: 2+ файла отправляем одним альбомом (sendMediaGroup type=document),
  // чтобы в TG получился один баббл. Один файл — обычный sendDocument с caption.
  // Подпись/reply у документов — только если картинок НЕТ (иначе они уже у фото).
  // При гранулярном фолбэке `only:'documents'` массив images всё ещё полон, так
  // что caption к документам не приклеится повторно — дубля подписи нет.
  const documentsCaptionAvailable = images.length === 0 ? caption : undefined;
  const documentsReplyTo = images.length === 0 ? replyToTelegramMessageId : undefined;

  if (doDocuments && others.length >= 2) {
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
          documentsOk = false;
          await supabaseClient
            .from("project_messages")
            .update({ telegram_error_detail: `sendMediaGroup(document): ${nullCount}/${resolved.length} attachments failed to resolve` })
            .eq("id", messageId);
        }

        const formData = new FormData();
        formData.append("chat_id", String(chatId));

        const media: Record<string, unknown>[] = [];
        const mediaAttachmentIds: string[] = [];
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
          mediaAttachmentIds.push((chunk[idx] as Record<string, unknown>).id as string);
        });

        formData.append("media", JSON.stringify(media));

        if (isFirstChunk) appendReplyParam(formData, documentsReplyTo);

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
          documentsOk = false;
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

        // Per-file id: адрес каждого документа в Telegram — для точечного
        // удаления одного файла из альбома.
        if (tgData.ok && Array.isArray(tgData.result)) {
          for (let k = 0; k < tgData.result.length; k++) {
            const tgMsgId = tgData.result[k]?.message_id;
            const attId = mediaAttachmentIds[k];
            if (tgMsgId && attId) {
              await supabaseClient
                .from("message_attachments")
                .update({ telegram_message_id: tgMsgId })
                .eq("id", attId);
            }
          }
        }

        isFirstChunk = false;
      } catch (err) {
        console.error("Error sending document group to TG:", err);
        documentsOk = false;
      }
    }
  } else if (doDocuments && others.length === 1) {
    // Один документ — обычный sendDocument с caption.
    try {
      const r = await resolveAttachment(others[0], supabaseClient);
      if (!r) {
        documentsOk = false;
      } else {
        const formData = new FormData();
        formData.append("chat_id", String(chatId));
        formData.append("document", r.blob, r.fileName);

        if (documentsCaptionAvailable) {
          formData.append("caption", documentsCaptionAvailable.slice(0, 1024));
          formData.append("parse_mode", "HTML");
        }
        appendReplyParam(formData, documentsReplyTo);

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
          documentsOk = false;
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

        // Per-file id для точечного удаления одного файла в канале.
        if (tgData.ok && tgData.result?.message_id) {
          await supabaseClient
            .from("message_attachments")
            .update({ telegram_message_id: tgData.result.message_id })
            .eq("id", (others[0] as Record<string, unknown>).id as string);
        }
      }
    } catch (err) {
      console.error("Error sending document to TG:", err);
      documentsOk = false;
    }
  }

  return {
    imagesOk,
    documentsOk,
    hadImages: images.length > 0,
    hadDocuments: others.length > 0,
  };
}
