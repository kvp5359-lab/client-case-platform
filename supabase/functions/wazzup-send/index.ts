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
import {
  preflight, jsonRes, okText, requireInternalSecret, getServiceClient,
  markOutgoingExternal,
} from "../_shared/edge.ts";
import { markMessageSent, markMessageFailed } from "../_shared/messageSendStatus.ts";
import { stripHtmlBasic } from "../_shared/channelText.ts";

interface RequestBody {
  message_id: string;
  attachments_only?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return okText();

  // Двойная схема auth: триггер шлёт x-internal-secret, фронт — Bearer JWT.
  if (!requireInternalSecret(req, /* allowBearer */ true)) {
    return jsonRes({ error: "Unauthorized" }, 401, req);
  }

  let body: RequestBody;
  try { body = await req.json() as RequestBody; }
  catch { return jsonRes({ error: "Invalid JSON" }, 400, req); }
  if (!body.message_id) return jsonRes({ error: "message_id required" }, 400, req);

  const service = getServiceClient();

  // 1. Сообщение
  const { data: msg } = await service
    .from("project_messages")
    .select("id, thread_id, content, wazzup_message_id, send_status, workspace_id, reply_to_message_id, has_attachments")
    .eq("id", body.message_id)
    .maybeSingle();
  if (!msg || !msg.thread_id) return jsonRes({ skip: "no thread" }, 200, req);
  if (msg.send_status === "sent" || msg.wazzup_message_id) {
    return jsonRes({ skip: "already sent" }, 200, req);
  }

  // 2. Тред
  const { data: thread } = await service
    .from("project_threads")
    .select("id, wazzup_channel_id, wazzup_chat_id, wazzup_chat_type")
    .eq("id", msg.thread_id)
    .maybeSingle();
  if (!thread || !thread.wazzup_channel_id || !thread.wazzup_chat_id) {
    return jsonRes({ skip: "not a wazzup thread" }, 200, req);
  }

  // 3. Канал
  const { data: channel } = await service
    .from("wazzup_channels")
    .select("channel_id, transport, workspace_id, is_active, state")
    .eq("id", thread.wazzup_channel_id)
    .maybeSingle();
  if (!channel) return jsonRes({ skip: "channel not found" }, 200, req);
  if (!channel.is_active) return jsonRes({ skip: "channel disabled in our DB" }, 200, req);

  // 4. API-ключ
  const { data: settings } = await service
    .from("wazzup_settings").select("api_key")
    .eq("workspace_id", channel.workspace_id).maybeSingle();
  if (!settings?.api_key) return jsonRes({ skip: "no api key" }, 200, req);

  let text = stripHtmlBasic(msg.content || "");

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
      const origText = stripHtmlBasic((orig.content as string) ?? "");
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
      return jsonRes({ skip: "has_attachments=true but no rows in message_attachments" }, 200, req);
    }

    // Wazzup НЕ позволяет text + contentUri в одном запросе
    // (INVALID_MESSAGE_DATA: fields["text","contentUri"]). Поэтому если есть
    // и текст-caption и файлы — сначала отдельным запросом отправляем текст
    // (с reply-цитатой и quotedMessageId), потом серию запросов с contentUri.
    //
    // Плейсхолдер «📎» (это значение content, когда у сообщения есть только
    // вложения без текста) — пропускаем, иначе перед файлом приходит лишний
    // одиночный «📎»-баббл.
    const isAttachmentPlaceholder = text.trim() === "📎";
    if (text.trim() && !isAttachmentPlaceholder) {
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
    if (!text.trim()) return jsonRes({ skip: "empty content" }, 200, req);
    const payload: Record<string, unknown> = { ...baseRequest, text };
    if (quotedMessageId) payload.quotedMessageId = quotedMessageId;

    const result = await sendWazzup(settings.api_key, payload);
    if (result.ok && result.messageId) firstWazzupMessageId = result.messageId;
    else firstError = result.error ?? "send failed";
  }

  // 8. Стамп результата.
  if (firstWazzupMessageId) {
    await markMessageSent(service, msg.id, {
      channelFields: {
        wazzup_message_id: firstWazzupMessageId,
        wazzup_status: "sent",
      },
    });
    return jsonRes({ ok: true, wazzup_message_id: firstWazzupMessageId }, 200, req);
  }

  console.error(`[wazzup-send] error:`, firstError);
  await markMessageFailed(
    service,
    msg.id,
    firstError ?? "Wazzup send failed",
    {
      channelFields: { wazzup_status: "error" },
      failureSource: "wazzup",
      failureCode: "wazzup_send_failed",
      failureMetadata: { stage: "send" },
    },
  );
  return jsonRes({ ok: false, error: firstError }, 200, req);
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

  // Все исходящие messageId записываем в общий dedup, чтобы webhook не
  // создавал дубли при echo. Первый id всё равно сохранится через
  // project_messages.wazzup_message_id (UNIQUE отсечёт), но для второго/
  // третьего файла без dedup мы бы получали отдельные баблы echo.
  await markOutgoingExternal(getServiceClient(), "wazzup", json.messageId, "send");

  return { ok: true, messageId: json.messageId };
}
