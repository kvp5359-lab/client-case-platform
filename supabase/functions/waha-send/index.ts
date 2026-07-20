/**
 * Edge Function: waha-send — отправка исходящих WhatsApp через self-hosted WAHA.
 *
 * Текст — из триггера dispatch_message_to_channels (x-internal-secret).
 * Вложения — фронт-invoke с attachments_only:true (файлы скачиваются из Storage,
 * шлются в WAHA как base64: sendImage / sendVoice / sendFile, caption у первого).
 *
 * Деплой: --no-verify-jwt.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { htmlToWhatsApp } from "../_shared/htmlFormatting.ts";
import { STORAGE_BUCKETS, storageDownload } from "../_shared/storage.ts";
import { wahaMsgCore } from "../_shared/whatsappThread.ts";
import { resolveSenderName } from "../_shared/senderPrefix.ts";

type SenderRow = { name?: string | null; last_name?: string | null; messenger_name?: string | null };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_FUNCTION_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const WAHA_URL = (Deno.env.get("WAHA_URL") ?? "").replace(/\/+$/, "");
const WAHA_API_KEY = Deno.env.get("WAHA_API_KEY") ?? "";
const WAHA_STATUS_WORKING = "WORKING"; // статус готовой к работе сессии в WAHA

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
async function markSent(service: SupabaseClient, id: string, wahaMessageId: string | null) {
  await service.from("project_messages").update({
    send_status: "sent", send_failed_reason: null,
    waha_message_id: wahaMessageId ?? undefined,
    waha_msg_core: wahaMessageId ? (wahaMsgCore(wahaMessageId) ?? undefined) : undefined,
    waha_status: "sent",
  }).eq("id", id);
}
async function markFailed(service: SupabaseClient, id: string, reason: string) {
  await service.from("project_messages").update({
    send_status: "failed", send_failed_reason: reason.slice(0, 500),
  }).eq("id", id);
}
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
async function waha(path: string, body: unknown): Promise<Response> {
  return fetch(`${WAHA_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": WAHA_API_KEY },
    body: JSON.stringify(body),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  // Триггер шлёт x-internal-secret; фронт (вложения) — Bearer JWT. Для attachments
  // допускаем оба (фронт-invoke не несёт internal-secret).
  const internal = INTERNAL_FUNCTION_SECRET && req.headers.get("x-internal-secret") === INTERNAL_FUNCTION_SECRET;
  const bearer = (req.headers.get("Authorization") ?? "").startsWith("Bearer ");
  if (!internal && !bearer) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: { message_id?: string; attachments_only?: boolean };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400 }); }
  const messageId = body.message_id;
  if (!messageId) return new Response(JSON.stringify({ error: "Missing field: message_id" }), { status: 400 });

  const service = svc();

  const { data: msg } = await service.from("project_messages")
    .select("id, thread_id, content, reply_to_message_id, visibility, has_attachments, sender_participant_id")
    .eq("id", messageId).maybeSingle();
  if (!msg) return new Response(JSON.stringify({ error: "message not found" }), { status: 404 });

  // Backstop видимости (внутреннее наружу не шлём)
  if (msg.visibility && msg.visibility !== "client") {
    await markSent(service, messageId, null);
    return new Response(JSON.stringify({ ok: true, skipped: "internal_visibility" }), { status: 200 });
  }

  // Тред → сессия + чат
  const { data: thread } = await service.from("project_threads")
    .select("waha_session_id, waha_chat_id, waha_group, whatsapp_pair_key, workspace_id")
    .eq("id", msg.thread_id as string).maybeSingle();
  if (!thread?.waha_session_id || !thread?.waha_chat_id) {
    await markFailed(service, messageId, "waha thread binding missing");
    return new Response(JSON.stringify({ error: "no waha binding" }), { status: 400 });
  }

  // Выбор сессии/чата. В общем треде (ГРУППА или пара КОЛЛЕГ) отправляем через
  // сессию АВТОРА (его номер тоже в чате → собеседник видит, кто написал). Для
  // пары дополнительно цель = ВТОРОЙ номер пары (двунаправленно). Фолбэк —
  // сессия/чат, привязанные к треду. Ограничение: если у автора несколько
  // рабочих номеров, берём самый ранний.
  let sendSessionId = thread.waha_session_id as string;
  let chatOverride: string | null = null;
  let senderPrefixName: string | null = null; // имя-префикс (настройка «показывать отправителя»)
  if ((thread.waha_group || thread.whatsapp_pair_key) && msg.sender_participant_id) {
    // Автор — участник этого треда (его номер РЕАЛЬНО в чате)? Только тогда шлём
    // с его номера. Иначе (напр. менеджер, которого нет в группе) — уходит с
    // номера, привязанного к треду (номер группы), лишь бы доставилось; кто автор
    // на самом деле — видно в сервисе (и в префиксе, если настройка включена).
    const { data: memberRow } = await service.from("project_thread_members")
      .select("participant_id").eq("thread_id", msg.thread_id as string)
      .eq("participant_id", msg.sender_participant_id as string).maybeSingle();
    if (memberRow) {
      const { data: sp } = await service.from("participants")
        .select("user_id").eq("id", msg.sender_participant_id as string).maybeSingle();
      if (sp?.user_id) {
        const { data: ownSess } = await service.from("waha_sessions")
          .select("id, phone").eq("owner_user_id", sp.user_id as string)
          .eq("workspace_id", thread.workspace_id as string)
          .eq("status", WAHA_STATUS_WORKING)
          .order("created_at", { ascending: true }).limit(1).maybeSingle();
        if (ownSess?.id) {
          sendSessionId = ownSess.id as string;
          if (thread.whatsapp_pair_key) {
            const parts = (thread.whatsapp_pair_key as string).split("_");
            const authorPhone = ((ownSess.phone as string) ?? "").replace(/\D/g, "");
            const target = parts[0] === authorPhone ? parts[1] : parts[0];
            if (target) chatOverride = `${target}@c.us`;
          }
        }
      }
    }
  }

  // Настройка воркспейса «показывать имя отправителя» — префикс к тексту (клиент
  // видит, кто из команды написал). Не для пары коллег (они и так знают друг друга).
  if (!thread.whatsapp_pair_key && msg.sender_participant_id) {
    const { data: ws } = await service.from("workspaces")
      .select("waha_show_sender_name").eq("id", thread.workspace_id as string).maybeSingle();
    if (ws?.waha_show_sender_name) {
      const { data: p } = await service.from("participants")
        .select("name, last_name, messenger_name").eq("id", msg.sender_participant_id as string).maybeSingle();
      senderPrefixName = resolveSenderName(p as SenderRow | null);
    }
  }

  const { data: session } = await service.from("waha_sessions")
    .select("session_name").eq("id", sendSessionId).maybeSingle();
  if (!session?.session_name) {
    await markFailed(service, messageId, "waha session missing");
    return new Response(JSON.stringify({ error: "no session" }), { status: 400 });
  }
  if (!WAHA_URL || !WAHA_API_KEY) {
    await markFailed(service, messageId, "WAHA_URL/API_KEY not configured");
    return new Response(JSON.stringify({ error: "waha not configured" }), { status: 500 });
  }
  const sessionName = session.session_name as string;
  const chatId = chatOverride ?? (thread.waha_chat_id as string);

  // ── Вложения ──────────────────────────────────────────────────────────────
  if (body.attachments_only) {
    const { data: atts } = await service.from("message_attachments")
      .select("file_name, mime_type, storage_path").eq("message_id", messageId);
    if (!atts || atts.length === 0) {
      await markSent(service, messageId, null);
      return new Response(JSON.stringify({ ok: true, skipped: "no_attachments" }), { status: 200 });
    }
    // caption — текст сообщения, кроме плейсхолдера «📎»
    const rawText = htmlToWhatsApp(msg.content ?? "");
    const baseCaption = rawText && rawText !== "📎" ? rawText : "";
    const caption = senderPrefixName && baseCaption
      ? `*${senderPrefixName}:*\n${baseCaption}`
      : baseCaption;
    let lastId: string | null = null;
    const failed: string[] = [];

    for (let i = 0; i < atts.length; i++) {
      const att = atts[i];
      try {
        const { data: blob, error: dlErr } = await storageDownload(
          service, STORAGE_BUCKETS.files, att.storage_path as string,
        );
        if (dlErr || !blob) { failed.push(att.file_name as string); continue; }
        const data = toBase64(await blob.arrayBuffer());
        const mime = (att.mime_type as string) ?? "application/octet-stream";
        const file = { mimetype: mime, filename: att.file_name as string, data };

        let endpoint = "/api/sendFile";
        const payload: Record<string, unknown> = { session: sessionName, chatId, file };
        if (mime.startsWith("image/")) {
          endpoint = "/api/sendImage";
          if (i === 0 && caption) payload.caption = caption;
        } else if (mime.startsWith("audio/") || mime.includes("ogg")) {
          endpoint = "/api/sendVoice"; // без caption
        } else {
          if (i === 0 && caption) payload.caption = caption;
        }

        const res = await waha(endpoint, payload);
        const rd = await res.json().catch(() => ({}));
        if (!res.ok) { failed.push(att.file_name as string); continue; }
        lastId = (typeof rd?.id === "string" ? rd.id : null)
          ?? (typeof rd?.id?._serialized === "string" ? rd.id._serialized : null) ?? lastId;
      } catch (_e) {
        failed.push(att.file_name as string);
      }
    }

    if (failed.length === atts.length) {
      await markFailed(service, messageId, `waha attachments failed: ${failed.join(", ")}`);
      return new Response(JSON.stringify({ error: "all attachments failed" }), { status: 502 });
    }
    await markSent(service, messageId, lastId);
    return new Response(JSON.stringify({ ok: true, failed }), { status: 200 });
  }

  // ── Текст ─────────────────────────────────────────────────────────────────
  const baseText = htmlToWhatsApp(msg.content ?? "");
  const text = senderPrefixName && baseText.trim() ? `*${senderPrefixName}:*\n${baseText}` : baseText;
  if (!text.trim()) {
    await markSent(service, messageId, null);
    return new Response(JSON.stringify({ ok: true, skipped: "empty" }), { status: 200 });
  }

  let replyTo: string | null = null;
  if (msg.reply_to_message_id) {
    const { data: orig } = await service.from("project_messages")
      .select("waha_message_id").eq("id", msg.reply_to_message_id as string).maybeSingle();
    replyTo = orig?.waha_message_id ?? null;
  }

  const sendBody: Record<string, unknown> = { session: sessionName, chatId, text };
  if (replyTo) sendBody.reply_to = replyTo;

  try {
    const res = await waha("/api/sendText", sendBody);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = typeof data?.message === "string" ? data.message : `WAHA ${res.status}`;
      await markFailed(service, messageId, reason);
      return new Response(JSON.stringify({ error: reason }), { status: 502 });
    }
    const wahaId: string | null =
      (typeof data?.id === "string" ? data.id : null) ??
      (typeof data?.id?._serialized === "string" ? data.id._serialized : null) ??
      (typeof data?.key?.id === "string" ? data.key.id : null);
    await markSent(service, messageId, wahaId);
    return new Response(JSON.stringify({ ok: true, waha_message_id: wahaId }), { status: 200 });
  } catch (err) {
    await markFailed(service, messageId, `waha send error: ${err}`);
    return new Response(JSON.stringify({ error: String(err) }), { status: 502 });
  }
});
