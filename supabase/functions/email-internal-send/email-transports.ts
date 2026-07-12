/**
 * Каналы отправки письма (вынесены из index.ts, распил 2026-07-12 — логика не
 * менялась):
 *  - sendViaEmployeeMailbox — через Gmail сотрудника (users.messages.send);
 *  - sendViaResend — через Resend от t+<short_id>@<slug>.clientcase.app.
 */
import { jsonRes } from "../_shared/edge.ts";
import { ensureValidGmailToken, type GmailAccountData } from "../_shared/gmailToken.ts";
import { uint8ArrayToBase64 } from "../_shared/encoding.ts";
import { markMessageSent, markMessageFailed } from "../_shared/messageSendStatus.ts";
import { buildRfc2822, escapeFromName } from "./email-format.ts";
import type { OutboundEmailCtx, WorkspaceRow } from "./email-types.ts";

export const ROOT_DOMAIN = "clientcase.app";
export const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

/**
 * Находит Gmail-threadId письма по его RFC822 Message-ID в ящике сотрудника.
 * Нужно для склейки ответа в существующую ветку у НАС, когда входящее пришло
 * пересылкой→Resend и его Gmail-threadId не сохранён (или сохранён неверный —
 * от нашей же прошлой ветки). Возвращает null при любой ошибке/отсутствии —
 * безопасный фолбэк (тогда отправка идёт как раньше).
 */
async function findGmailThreadByMessageId(
  accessToken: string,
  messageId: string,
): Promise<string | null> {
  const rid = messageId.replace(/^<+|>+$/g, "").trim();
  if (!rid) return null;
  try {
    const resp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&q=${encodeURIComponent(
        `rfc822msgid:${rid}`,
      )}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!resp.ok) return null;
    const j = (await resp.json()) as { messages?: Array<{ threadId?: string }> };
    return j.messages?.[0]?.threadId ?? null;
  } catch {
    return null;
  }
}

/** ВЕТКА 1: employee_mailbox — через Gmail сотрудника (users.messages.send). */
export async function sendViaEmployeeMailbox(ctx: OutboundEmailCtx, sendAccountId: string): Promise<Response> {
  const { service, m, t, req, senderName, subjectRaw, subjectRoot, inReplyTo, references, html, text, attachments } = ctx;
    const { data: account, error: accErr } = await service
      .from("email_accounts")
      .select(
        "id, user_id, email, access_token, refresh_token, token_expires_at, last_history_id, watch_expires_at, workspace_id, is_active",
      )
      .eq("id", sendAccountId)
      .maybeSingle();
    if (accErr || !account) {
      return jsonRes({ error: "email account not found" }, 404, req);
    }
    const acc = account as GmailAccountData & { is_active: boolean; workspace_id: string };
    if (!acc.is_active) {
      return jsonRes({ error: "email account inactive" }, 400, req);
    }

    let accessToken: string;
    try {
      accessToken = await ensureValidGmailToken(service, acc);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      await markMessageFailed(service, m.id, `Не удалось получить токен Gmail: ${detail}`, {
        channelFields: {
          email_delivery_status: "failed",
          email_send_method: "employee_mailbox",
        },
        failureSource: "email",
        failureCode: "gmail_token_failed",
        failureMetadata: { stage: "gmail_token" },
      });
      return jsonRes(
        { error: "gmail_token_failed", detail },
        502, req);
    }

    const messageIdHeader = `<${crypto.randomUUID()}@${acc.email.split("@")[1] ?? "gmail.com"}>`;

    // Если у треда уже есть gmail_thread_id (после первой отправки/входящего),
    // передаём его в Gmail API — это гарантирует склейку в один тред у клиента.
    // Без этого Gmail группирует только по In-Reply-To/Subject, и иногда
    // отделяет письма в новый тред.
    const { data: existingLinkPre } = await service
      .from("project_thread_email_links")
      .select("gmail_thread_id")
      .eq("thread_id", t.id)
      .eq("contact_email", (t.email_last_external_address ?? "").toLowerCase())
      .maybeSingle();
    const existingGmailThreadId =
      (existingLinkPre as { gmail_thread_id: string | null } | null)?.gmail_thread_id ?? null;

    const rfc2822 = buildRfc2822({
      fromName: senderName,
      fromAddress: acc.email,
      to: t.email_last_external_address,
      subject: subjectRaw,
      messageId: messageIdHeader,
      inReplyTo,
      references,
      html,
      text,
      attachments,
    });
    const raw = uint8ArrayToBase64(new TextEncoder().encode(rfc2822))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Сначала ищем НАСТОЯЩИЙ Gmail-тред письма, на которое отвечаем (по его
    // Message-ID). Это чинит случай, когда входящее пришло пересылкой→Resend
    // и сохранённый gmail_thread_id отсутствует/указывает на нашу же новую
    // ветку. Фолбэк — сохранённый gmail_thread_id, затем без threadId.
    let resolvedThreadId: string | null = null;
    if (inReplyTo) {
      resolvedThreadId = await findGmailThreadByMessageId(accessToken, inReplyTo);
    }
    if (!resolvedThreadId) resolvedThreadId = existingGmailThreadId;

    const sendBody: { raw: string; threadId?: string } = { raw };
    if (resolvedThreadId) sendBody.threadId = resolvedThreadId;

    let gmailResp = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sendBody),
      },
    );

    // Fallback на 404 при наличии threadId: Gmail Кирилла не знает thread
    // от Дениса (тред принадлежит другому Gmail-аккаунту). Повторяем без
    // threadId — Gmail создаст новую ветку у себя, но клиенту письмо
    // сгруппируется по нашим In-Reply-To/References (RFC-стандарт).
    if (!gmailResp.ok && gmailResp.status === 404 && sendBody.threadId) {
      console.warn(
        `[email-internal-send] Gmail 404 for threadId ${sendBody.threadId} — retrying without threadId`,
      );
      const fallbackBody = { raw: sendBody.raw };
      gmailResp = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(fallbackBody),
        },
      );
    }
    if (!gmailResp.ok) {
      const errBody = await gmailResp.text().catch(() => "");
      await markMessageFailed(
        service,
        m.id,
        errBody.slice(0, 500) || `Gmail API ${gmailResp.status}`,
        {
          channelFields: {
            email_delivery_status: "failed",
            email_send_method: "employee_mailbox",
          },
          failureSource: "email",
          failureCode: `gmail_${gmailResp.status}`,
          failureMetadata: { stage: "gmail_send" },
        },
      );
      return jsonRes(
        { error: "gmail_send_failed", status: gmailResp.status, detail: errBody.slice(0, 500) },
        502, req);
    }
    // Сохраняем gmail_thread_id чтобы gmail-webhook смог сматчить
    // ответ клиента (Pub/Sub-уведомление приходит на наш Gmail и
    // gmail-webhook ищет тред по project_thread_email_links.gmail_thread_id).
    const gmailJson = (await gmailResp.json().catch(() => ({}))) as {
      threadId?: string;
      id?: string;
    };
    const gmailThreadId = gmailJson.threadId ?? null;

    // Gmail API при users.messages.send ИГНОРИРУЕТ наш Message-ID и подставляет
    // свой. Если оставить наш UUID в email_message_id, следующее письмо в
    // треде сошлётся на несуществующий ID, и Gmail получателя отделит его
    // в новый тред. Поэтому читаем реальный Message-ID из Gmail и сохраняем.
    let actualMessageId = messageIdHeader;
    if (gmailJson.id) {
      try {
        const metaResp = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailJson.id}?format=metadata&metadataHeaders=Message-ID`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (metaResp.ok) {
          const meta = (await metaResp.json()) as {
            payload?: { headers?: Array<{ name: string; value: string }> };
          };
          const midHeader = meta?.payload?.headers?.find(
            (h) => h.name.toLowerCase() === "message-id",
          );
          if (midHeader?.value) actualMessageId = midHeader.value;
        }
      } catch (_) {
        // Fallback на messageIdHeader — лучше что-то, чем ничего.
      }
    }

    await markMessageSent(service, m.id, {
      channelFields: {
        email_message_id: actualMessageId,
        email_send_method: "employee_mailbox",
        email_send_account_id: sendAccountId,
        email_delivery_status: "sent",
        email_subject: subjectRaw,
      },
    });

    if (!t.email_subject_root) {
      const root = subjectRaw.replace(/^\s*Re:\s*/i, "").trim();
      if (root) {
        await service.from("project_threads").update({ email_subject_root: root }).eq("id", t.id);
      }
    }

    // Upsert email_link: один на (thread_id, contact_email).
    if (gmailThreadId && t.email_last_external_address) {
      const { data: existingLink } = await service
        .from("project_thread_email_links")
        .select("id")
        .eq("thread_id", t.id)
        .eq("contact_email", t.email_last_external_address)
        .maybeSingle();
      if (existingLink) {
        await service
          .from("project_thread_email_links")
          .update({ gmail_thread_id: gmailThreadId, is_active: true })
          .eq("id", (existingLink as { id: string }).id);
      } else {
        await service.from("project_thread_email_links").insert({
          thread_id: t.id,
          contact_email: t.email_last_external_address,
          gmail_thread_id: gmailThreadId,
          subject: subjectRoot,
        });
      }
    }

    return jsonRes({
      ok: true,
      method: "employee_mailbox",
      message_id_header: messageIdHeader,
      gmail_thread_id: gmailThreadId,
      from: acc.email,
      to: t.email_last_external_address,
    }, 200, req);
}

/** ВЕТКА 2: system_postmark — через Resend от t+<short_id>@<slug>.clientcase.app. */
export async function sendViaResend(ctx: OutboundEmailCtx, w: WorkspaceRow): Promise<Response> {
  const { service, m, t, req, senderName, subjectRaw, subjectRoot, inReplyTo, references, html, text, attachments } = ctx;
  const fromAddress = `t+${t.short_id}@${w.slug}.${ROOT_DOMAIN}`;
  const messageIdHeader = `<${crypto.randomUUID()}@${w.slug}.${ROOT_DOMAIN}>`;

  const headers: Record<string, string> = { "Message-ID": messageIdHeader };
  if (inReplyTo) headers["In-Reply-To"] = inReplyTo;
  if (references.length) headers["References"] = references.join(" ");

  const resendBody: Record<string, unknown> = {
    from: `"${escapeFromName(senderName)}" <${fromAddress}>`,
    to: [t.email_last_external_address],
    subject: subjectRaw,
    html,
    text,
    headers,
  };
  if (attachments.length > 0) {
    resendBody.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: a.base64,
      content_type: a.mime,
    }));
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(resendBody),
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    await markMessageFailed(
      service,
      m.id,
      errBody.slice(0, 500) || `Resend API ${resp.status}`,
      {
        channelFields: {
          email_delivery_status: "failed",
          email_send_method: "system_postmark",
        },
        failureSource: "email",
        failureCode: `resend_${resp.status}`,
        failureMetadata: { stage: "resend_send" },
      },
    );
    return jsonRes(
      { error: "resend_send_failed", status: resp.status, detail: errBody.slice(0, 500) },
      502, req);
  }

  const result = await resp.json().catch(() => ({} as Record<string, unknown>));
  const resendId = (result as { id?: string }).id ?? null;

  await markMessageSent(service, m.id, {
    channelFields: {
      email_message_id: messageIdHeader,
      email_resend_id: resendId,
      email_send_method: "system_postmark",
      email_delivery_status: "sent",
      email_subject: subjectRaw,
    },
  });

  // Запоминаем тему как «корень» переписки, если ещё нет
  if (!t.email_subject_root) {
    const root = subjectRaw.replace(/^\s*Re:\s*/i, "").trim();
    if (root) {
      await service
        .from("project_threads")
        .update({ email_subject_root: root })
        .eq("id", t.id);
    }
  }

  return jsonRes({
    ok: true,
    resend_id: resendId,
    message_id_header: messageIdHeader,
    from: fromAddress,
    to: t.email_last_external_address,
  }, 200, req);
}
