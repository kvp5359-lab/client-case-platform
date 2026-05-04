/**
 * Edge Function: wazzup-send (v2 — с reply и вложениями).
 *
 * Шлёт исходящее сообщение в Wazzup. Вызывается:
 *  - триггером notify_telegram_on_new_message при INSERT в project_messages
 *    (только для текстовых, has_attachments=false);
 *  - фронтом напрямую (через invoke с x-internal-secret) при наличии
 *    вложений — тогда параметр attachments_only=true: триггер пропустил
 *    сообщение, и фронт сам инициирует отправку после загрузки файлов.
 *
 * Поведение:
 *  1. Текст без вложений → POST /v3/message с text [+ quotedMessageId].
 *  2. Текст + вложения → для каждого файла отдельный POST /v3/message с
 *     contentUri (signed URL из Storage), у первого добавляется text как
 *     caption, у первого же — quotedMessageId (если reply). wazzup_message_id
 *     стампим из первого ответа Wazzup (это сообщение и видно в треде).
 *  3. Только вложения, без текста → то же, без caption.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

interface RequestBody {
  message_id: string;
  attachments_only?: boolean;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  // Двойная схема auth:
  //  1) Триггер БД шлёт x-internal-secret (без JWT) — это исторический путь.
  //  2) Фронт (через supabase.functions.invoke) шлёт Bearer JWT, и тогда
  //     deploy с verify_jwt=true сам Supabase проверит токен — нам ничего
  //     дополнительно делать не нужно. Поэтому если нет x-internal-secret,
  //     просто продолжаем — JWT уже валиден.
  const internal = req.headers.get("x-internal-secret");
  const hasInternal = !!internal && INTERNAL_SECRET && internal === INTERNAL_SECRET;
  const hasBearer = (req.headers.get("authorization") ?? "").startsWith("Bearer ");
  if (!hasInternal && !hasBearer) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  let body: RequestBody;
  try { body = await req.json() as RequestBody; }
  catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }
  if (!body.message_id) {
    return new Response(JSON.stringify({ error: "message_id required" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Сообщение
  const { data: msg } = await service
    .from("project_messages")
    .select("id, thread_id, content, wazzup_message_id, workspace_id, reply_to_message_id, has_attachments")
    .eq("id", body.message_id)
    .maybeSingle();
  if (!msg || !msg.thread_id) return jsonOk({ skip: "no thread" });
  if (msg.wazzup_message_id) return jsonOk({ skip: "already sent" });

  // 2. Тред
  const { data: thread } = await service
    .from("project_threads")
    .select("id, wazzup_channel_id, wazzup_chat_id, wazzup_chat_type")
    .eq("id", msg.thread_id)
    .maybeSingle();
  if (!thread || !thread.wazzup_channel_id || !thread.wazzup_chat_id) {
    return jsonOk({ skip: "not a wazzup thread" });
  }

  // 3. Канал
  const { data: channel } = await service
    .from("wazzup_channels")
    .select("channel_id, transport, workspace_id, is_active, state")
    .eq("id", thread.wazzup_channel_id)
    .maybeSingle();
  if (!channel) return jsonOk({ skip: "channel not found" });
  if (!channel.is_active) return jsonOk({ skip: "channel disabled in our DB" });

  // 4. API-ключ
  const { data: settings } = await service
    .from("wazzup_settings").select("api_key")
    .eq("workspace_id", channel.workspace_id).maybeSingle();
  if (!settings?.api_key) return jsonOk({ skip: "no api key" });

  const text = stripHtml(msg.content || "");

  // 5. Reply lookup: если у нас reply_to_message_id, ищем wazzup_message_id оригинала.
  let quotedMessageId: string | null = null;
  if (msg.reply_to_message_id) {
    const { data: orig } = await service
      .from("project_messages")
      .select("wazzup_message_id")
      .eq("id", msg.reply_to_message_id)
      .maybeSingle();
    quotedMessageId = (orig?.wazzup_message_id as string | null) ?? null;
  }

  const baseRequest = {
    channelId: channel.channel_id,
    chatType: thread.wazzup_chat_type ?? channel.transport ?? "whatsapp",
    chatId: thread.wazzup_chat_id,
  };

  // 6. Вложения, если есть.
  let firstWazzupMessageId: string | null = null;
  let firstError: string | null = null;

  if (msg.has_attachments) {
    const { data: attachments } = await service
      .from("message_attachments")
      .select("id, file_name, mime_type, storage_path")
      .eq("message_id", msg.id);

    if (!attachments || attachments.length === 0) {
      return jsonOk({ skip: "has_attachments=true but no rows in message_attachments" });
    }

    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      const { data: signed } = await service.storage
        .from("files")
        .createSignedUrl(att.storage_path as string, 60 * 60); // 1 час хватает

      if (!signed?.signedUrl) {
        console.warn("[wazzup-send] signed url failed for", att.storage_path);
        continue;
      }

      const payload: Record<string, unknown> = {
        ...baseRequest,
        contentUri: signed.signedUrl,
      };

      // Caption — только у первого файла.
      if (i === 0 && text.trim()) payload.text = text;
      // Reply — только у первого.
      if (i === 0 && quotedMessageId) payload.quotedMessageId = quotedMessageId;

      const result = await sendWazzup(settings.api_key, payload);
      if (result.ok && result.messageId) {
        if (i === 0) firstWazzupMessageId = result.messageId;
      } else if (i === 0) {
        firstError = result.error ?? "send failed";
      }
    }
  } else {
    // 7. Только текст.
    if (!text.trim()) return jsonOk({ skip: "empty content" });
    const payload: Record<string, unknown> = { ...baseRequest, text };
    if (quotedMessageId) payload.quotedMessageId = quotedMessageId;

    const result = await sendWazzup(settings.api_key, payload);
    if (result.ok && result.messageId) firstWazzupMessageId = result.messageId;
    else firstError = result.error ?? "send failed";
  }

  // 8. Стамп результата.
  if (firstWazzupMessageId) {
    await service.from("project_messages").update({
      wazzup_message_id: firstWazzupMessageId,
      wazzup_status: "sent",
    }).eq("id", msg.id);
    return jsonOk({ ok: true, wazzup_message_id: firstWazzupMessageId });
  }

  console.error(`[wazzup-send] error:`, firstError);
  await service.from("project_messages").update({ wazzup_status: "error" }).eq("id", msg.id);
  return jsonOk({ ok: false, error: firstError });
});

async function sendWazzup(
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const res = await fetch("https://api.wazzup24.com/v3/message", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as {
    messageId?: string; error?: string; description?: string;
  };
  if (!res.ok || !json.messageId) {
    const errDesc = json.description ?? json.error ?? `HTTP ${res.status}`;
    return { ok: false, error: errDesc };
  }
  return { ok: true, messageId: json.messageId };
}

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
