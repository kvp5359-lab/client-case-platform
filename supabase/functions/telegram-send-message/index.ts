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

  const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

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
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const { data: lastMsg } = await serviceClient
        .from("project_messages")
        .select("sender_name, source")
        .eq("project_id", body.project_id)
        .eq("channel", channel)
        .neq("id", body.message_id)
        .gte("created_at", fiveMinAgo)
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

        if (formattedCaption.length <= 1024) {
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

  if (!attachments || attachments.length === 0) return true;

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

  let isFirstOther = images.length === 0;
  for (const att of others) {
    try {
      const r = await resolveAttachment(att, supabaseClient);
      if (!r) {
        allSucceeded = false;
        continue;
      }

      const formData = new FormData();
      formData.append("chat_id", String(chatId));
      formData.append("document", r.blob, r.fileName);

      if (isFirstOther && caption) {
        formData.append("caption", caption.slice(0, 1024));
        formData.append("parse_mode", "HTML");
      }
      if (isFirstOther && replyToTelegramMessageId) {
        formData.append("reply_parameters", JSON.stringify({ message_id: replyToTelegramMessageId }));
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

      if (isFirstOther && !skipTelegramIdUpdate && images.length === 0 && tgData.ok && tgData.result?.message_id) {
        await supabaseClient
          .from("project_messages")
          .update({ telegram_message_id: tgData.result.message_id, telegram_chat_id: chatId })
          .eq("id", messageId);
      }

      isFirstOther = false;
    } catch (err) {
      console.error("Error sending document to TG:", err);
      allSucceeded = false;
    }
  }

  return allSucceeded;
}
