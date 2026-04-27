/**
 * Edge Function: telegram-send-message
 * Отправка сообщений из ЛК в Telegram-группу
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { safeJsonParse, findMissingField, isValidUUID } from "../_shared/validation.ts";
import { htmlToTelegramHtml, escapeHtmlEntities, isHtmlContent } from "../_shared/htmlFormatting.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { resolveBotToken } from "../_shared/telegramBotToken.ts";

interface RequestBody {
  message_id: string;
  project_id: string;
  content: string;
  sender_name: string;
  sender_role: string | null;
  telegram_chat_id: number;
  reply_to_telegram_message_id?: number | null;
  attachments_only?: boolean;
}

// Telegram sendPhoto / sendMediaGroup(type=photo) принимает только эти форматы.
// Остальное (tiff, heic, bmp, svg, ...) уходит через sendDocument.
const TELEGRAM_PHOTO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function isTelegramPhotoMime(mime: unknown): boolean {
  return typeof mime === "string" && TELEGRAM_PHOTO_MIME_TYPES.has(mime.toLowerCase());
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const authHeader = req.headers.get("authorization");
  const internalSecret = req.headers.get("x-internal-secret");
  const expectedSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");

  let authenticatedUserId: string | null = null;

  if (internalSecret) {
    if (!expectedSecret || internalSecret !== expectedSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } else if (authHeader) {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    authenticatedUserId = user.id;
  } else {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = safeJsonParse<RequestBody>(await req.text());
    if (!body) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const requiredFields = body.attachments_only
      ? ["message_id", "telegram_chat_id"]
      : ["message_id", "content", "sender_name", "telegram_chat_id"];
    const missing = findMissingField(body as unknown as Record<string, unknown>, requiredFields);
    if (missing) {
      return new Response(
        JSON.stringify({ error: `Missing field: ${missing}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!isValidUUID(body.message_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid message_id format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (typeof body.telegram_chat_id !== "number") {
      return new Response(
        JSON.stringify({ error: "telegram_chat_id must be a number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Выбираем токен бота по bot_version привязки группы (v1 или v2)
    const { token: TELEGRAM_BOT_TOKEN } = await resolveBotToken(serviceClient, body.telegram_chat_id);

    if (authenticatedUserId) {
      if (!body.project_id || !isValidUUID(body.project_id)) {
        return new Response(
          JSON.stringify({ error: "Access denied" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: project } = await serviceClient
        .from("projects")
        .select("workspace_id")
        .eq("id", body.project_id)
        .maybeSingle();

      if (!project?.workspace_id) {
        return new Response(
          JSON.stringify({ error: "Access denied" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const isMember = await checkWorkspaceMembership(serviceClient, authenticatedUserId, project.workspace_id);
      if (!isMember) {
        return new Response(
          JSON.stringify({ error: "Access denied" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    let showSenderName = true;
    if (body.project_id) {
      const { data: chatInfo } = await serviceClient
        .from("project_telegram_chats")
        .select("channel")
        .eq("telegram_chat_id", body.telegram_chat_id)
        .eq("is_active", true)
        .maybeSingle();

      const channel = chatInfo?.channel || "client";
      const sixtyMinAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const { data: lastMsg } = await serviceClient
        .from("project_messages")
        .select("sender_name, source")
        .eq("project_id", body.project_id)
        .eq("channel", channel)
        .neq("id", body.message_id)
        .gte("created_at", sixtyMinAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastMsg && lastMsg.sender_name === body.sender_name && lastMsg.source === "web") {
        showSenderName = false;
      }
    }

    const isAttachmentsOnlyContent = body.content === "\ud83d\udcce";
    if (!body.attachments_only && !isAttachmentsOnlyContent) {
      const contentForTelegram = isHtmlContent(body.content)
        ? htmlToTelegramHtml(body.content)
        : escapeHtmlEntities(body.content);
      const formattedText = showSenderName
        ? `<b>${escapeHtmlEntities(body.sender_name)}:</b>\n${contentForTelegram}`
        : contentForTelegram;

      const payload: Record<string, unknown> = {
        chat_id: body.telegram_chat_id,
        text: formattedText,
        parse_mode: "HTML",
      };

      if (body.reply_to_telegram_message_id) {
        payload.reply_parameters = {
          message_id: body.reply_to_telegram_message_id,
        };
      }

      const tgResponse = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const tgData = await tgResponse.json();

      if (tgData.ok && tgData.result?.message_id) {
        await serviceClient
          .from("project_messages")
          .update({
            telegram_message_id: tgData.result.message_id,
            telegram_chat_id: body.telegram_chat_id,
          })
          .eq("id", body.message_id);
      } else {
        console.error("Telegram API error:", tgData);
      }
    }

    if (body.attachments_only && body.message_id) {
      const hasText = body.content && body.content !== "\ud83d\udcce";
      let attachmentsOk = false;

      if (hasText) {
        const contentForTelegram = isHtmlContent(body.content)
          ? htmlToTelegramHtml(body.content)
          : escapeHtmlEntities(body.content);
        const formattedCaption = showSenderName
          ? `<b>${escapeHtmlEntities(body.sender_name || "")}:</b>\n${contentForTelegram}`
          : contentForTelegram;

        // Считаем, сколько будет вложений — чтобы решить, как слать текст.
        // При 2+ файлах caption на media-альбоме Telegram рисует между 1-м и 2-м
        // файлом (выглядит странно), поэтому в этом случае шлём текст отдельным
        // sendMessage ПЕРЕД альбомом. При 1 файле оставляем caption — получается
        // один баббл (текст под файлом).
        const { count: attachmentsCount } = await serviceClient
          .from("message_attachments")
          .select("id", { count: "exact", head: true })
          .eq("message_id", body.message_id);

        const sendTextAsSeparateMessage =
          formattedCaption.length > 1024 || (attachmentsCount ?? 0) >= 2;

        if (!sendTextAsSeparateMessage) {
          attachmentsOk = await sendAttachments(
            body.message_id, body.telegram_chat_id, serviceClient, TELEGRAM_BOT_TOKEN,
            formattedCaption, body.reply_to_telegram_message_id ?? undefined,
          );
        } else {
          const payload: Record<string, unknown> = {
            chat_id: body.telegram_chat_id,
            text: formattedCaption,
            parse_mode: "HTML",
          };
          if (body.reply_to_telegram_message_id) {
            payload.reply_parameters = { message_id: body.reply_to_telegram_message_id };
          }

          const tgRes = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
          );
          const tgData = await tgRes.json();
          if (tgData.ok && tgData.result?.message_id) {
            await serviceClient
              .from("project_messages")
              .update({ telegram_message_id: tgData.result.message_id, telegram_chat_id: body.telegram_chat_id })
              .eq("id", body.message_id);
          }

          attachmentsOk = await sendAttachments(
            body.message_id, body.telegram_chat_id, serviceClient, TELEGRAM_BOT_TOKEN,
            undefined, undefined, true,
          );
        }
      } else {
        attachmentsOk = await sendAttachments(
          body.message_id, body.telegram_chat_id, serviceClient, TELEGRAM_BOT_TOKEN,
          undefined, body.reply_to_telegram_message_id ?? undefined,
        );
      }

      await serviceClient
        .from("project_messages")
        .update({ telegram_attachments_delivered: attachmentsOk })
        .eq("id", body.message_id);
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("telegram-send-message error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function resolveAttachment(
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

async function sendAttachments(
  messageId: string,
  chatId: number,
  supabaseClient: ReturnType<typeof createClient>,
  botToken: string,
  caption?: string,
  replyToTelegramMessageId?: number,
  skipTelegramIdUpdate = false,
): Promise<boolean> {
  const { data: attachments } = await supabaseClient
    .from("message_attachments")
    .select("*")
    .eq("message_id", messageId);

  if (!attachments || attachments.length === 0) {
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

        const tgResult = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMediaGroup`,
          { method: "POST", body: formData },
        );

        const tgData = await tgResult.json();
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

        const tgResult = await fetch(
          `https://api.telegram.org/bot${botToken}/sendPhoto`,
          { method: "POST", body: formData },
        );

        const tgData = await tgResult.json();
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

        const tgResult = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMediaGroup`,
          { method: "POST", body: formData },
        );

        const tgData = await tgResult.json();
        if (!tgData.ok) {
          console.error("Telegram sendMediaGroup (document) error:", JSON.stringify(tgData));
          allSucceeded = false;
          // Пишем причину в БД — чтобы потом можно было посмотреть SQL-запросом.
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

        const tgResult = await fetch(
          `https://api.telegram.org/bot${botToken}/sendDocument`,
          { method: "POST", body: formData },
        );

        const tgData = await tgResult.json();
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
