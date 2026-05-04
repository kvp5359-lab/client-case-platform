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

  let text = stripHtml(msg.content || "");

  // 5. Reply: Wazzup API через `quotedMessageId` не цитирует наши исходящие
  // в WhatsApp (поле принимается без ошибки, но не отображается у клиента).
  // Поэтому делаем fallback — префикс цитаты прямо в тексте сообщения, как
  // делают Telegram-боты и Slack-интеграции. Если Wazzup когда-нибудь починит
  // quote через API — этот блок можно вернуть к чистому quotedMessageId.
  let quotedMessageId: string | null = null;
  if (msg.reply_to_message_id) {
    const { data: orig } = await service
      .from("project_messages")
      .select("wazzup_message_id, content, sender_name")
      .eq("id", msg.reply_to_message_id)
      .maybeSingle();
    quotedMessageId = (orig?.wazzup_message_id as string | null) ?? null;

    if (orig) {
      const origText = stripHtml((orig.content as string) ?? "");
      const truncated = origText.length > 200 ? origText.slice(0, 200) + "…" : origText;
      // Имя автора не добавляем — у клиента в WhatsApp контекст и так очевиден
      // (его собственное сообщение или наше предыдущее). Один перенос — иначе
      // в WhatsApp выходит лишняя пустая строка.
      text = `> ${truncated}\n${text}`;
    }
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

    // Wazzup НЕ позволяет text + contentUri в одном запросе
    // (INVALID_MESSAGE_DATA: fields["text","contentUri"]). Поэтому если есть
    // и текст-caption и файлы — сначала отдельным запросом отправляем текст
    // (с reply-цитатой и quotedMessageId), потом серию запросов с contentUri.
    if (text.trim()) {
      const textPayload: Record<string, unknown> = { ...baseRequest, text };
      if (quotedMessageId) textPayload.quotedMessageId = quotedMessageId;
      const textRes = await sendWazzup(settings.api_key, textPayload);
      if (textRes.ok && textRes.messageId) firstWazzupMessageId = textRes.messageId;
      else firstError = textRes.error ?? "text send failed";
    }

    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      const { data: signed } = await service.storage
        .from("files")
        .createSignedUrl(att.storage_path as string, 60 * 60);

      if (!signed?.signedUrl) {
        console.warn("[wazzup-send] signed url failed for", att.storage_path);
        continue;
      }

      const payload: Record<string, unknown> = {
        ...baseRequest,
        contentUri: signed.signedUrl,
      };
      // Если текста не было — quotedMessageId уйдёт с первым файлом.
      if (i === 0 && !text.trim() && quotedMessageId) {
        payload.quotedMessageId = quotedMessageId;
      }

      const result = await sendWazzup(settings.api_key, payload);
      if (result.ok && result.messageId) {
        // Запоминаем id только если не было текстового сообщения раньше.
        if (!firstWazzupMessageId) firstWazzupMessageId = result.messageId;
      } else if (!firstError) {
        firstError = result.error ?? "attachment send failed";
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
