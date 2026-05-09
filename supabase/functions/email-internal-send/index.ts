/**
 * Edge Function: email-internal-send
 *
 * Отправка исходящего письма из ClientCase в email-треде.
 *
 * Вызывается БД-триггером notify_telegram_on_new_message (через net.http_post),
 * когда тред считается email-каналом — `pt.email_send_account_id` IS NOT NULL
 * ИЛИ в треде уже есть сообщения с `source='email_internal'`.
 *
 * MVP — только метод `system_postmark` (=отправка через Resend с адреса
 * `t+<short_id>@<slug>.clientcase.app`). Метод `employee_mailbox`
 * (=через подключённый Gmail/SMTP сотрудника) — Phase 4-6 второй итерацией.
 *
 * Auth: deploy с `--no-verify-jwt`, защита `x-internal-secret` header
 * (или Bearer JWT для будущего ручного дёргания из фронта).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  preflight, jsonRes, requireInternalSecret, getServiceClient,
} from "../_shared/edge.ts";
import { ensureValidGmailToken, type GmailAccountData } from "../_shared/gmailToken.ts";
import { uint8ArrayToBase64 } from "../_shared/encoding.ts";

const ROOT_DOMAIN = "clientcase.app";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

interface MessageRow {
  id: string;
  content: string | null;
  sender_name: string | null;
  has_attachments: boolean;
  email_in_reply_to: string | null;
  email_references: string[] | null;
  email_subject: string | null;
  email_send_method: string | null;
  email_send_account_id: string | null;
  thread_id: string;
  workspace_id: string;
}

interface ThreadRowExt {
  email_send_account_id?: string | null;
  email_send_method?: string | null;
}

interface ThreadRow {
  id: string;
  short_id: number | null;
  email_subject_root: string | null;
  email_last_external_address: string | null;
}

interface WorkspaceRow {
  id: string;
  slug: string;
  email_active: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return jsonRes({ error: "method not allowed" }, 405);
  if (!requireInternalSecret(req, true)) {
    return jsonRes({ error: "unauthorized" }, 401);
  }
  if (!RESEND_API_KEY) return jsonRes({ error: "RESEND_API_KEY missing" }, 500);

  let body: { message_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonRes({ error: "invalid json" }, 400);
  }
  if (!body.message_id) return jsonRes({ error: "message_id required" }, 400);

  const service = getServiceClient();

  const { data: msg, error: msgErr } = await service
    .from("project_messages")
    .select(
      "id, content, sender_name, has_attachments, email_in_reply_to, email_references, email_subject, email_send_method, email_send_account_id, thread_id, workspace_id",
    )
    .eq("id", body.message_id)
    .maybeSingle();
  if (msgErr) return jsonRes({ error: "load_failed", detail: msgErr.message }, 500);
  if (!msg) return jsonRes({ error: "message not found" }, 404);
  if (!msg.thread_id) return jsonRes({ error: "message has no thread_id" }, 400);
  const m = msg as MessageRow;

  const { data: thread, error: threadErr } = await service
    .from("project_threads")
    .select(
      "id, short_id, email_subject_root, email_last_external_address, email_send_account_id, email_send_method",
    )
    .eq("id", m.thread_id)
    .maybeSingle();
  if (threadErr || !thread) {
    return jsonRes({ error: "thread not found" }, 404);
  }
  const t = thread as ThreadRow;
  if (t.short_id == null) return jsonRes({ error: "thread has no short_id" }, 400);
  if (!t.email_last_external_address) {
    return jsonRes({ error: "thread has no recipient (email_last_external_address)" }, 400);
  }

  const { data: ws, error: wsErr } = await service
    .from("workspaces")
    .select("id, slug, email_active")
    .eq("id", m.workspace_id)
    .maybeSingle();
  if (wsErr || !ws) return jsonRes({ error: "workspace not found" }, 404);
  const w = ws as WorkspaceRow;
  if (!w.email_active) {
    return jsonRes({ error: "workspace email not active" }, 400);
  }
  if (!w.slug) return jsonRes({ error: "workspace has no slug" }, 400);

  // Определяем In-Reply-To / References
  // Стратегия:
  //   In-Reply-To = Message-ID последнего входящего письма клиента в треде
  //                 (на что мы конкретно отвечаем).
  //   References  = вся цепочка Message-ID всех писем треда (входящих и
  //                 исходящих) по возрастанию даты — RFC 5322 §3.6.4.
  //                 Без полной цепочки Gmail иногда отделяет письма в
  //                 отдельный тред у клиента.
  let inReplyTo = m.email_in_reply_to;
  let references: string[] = m.email_references ?? [];

  const { data: chain } = await service
    .from("project_messages")
    .select("email_message_id, source, created_at")
    .eq("thread_id", t.id)
    .neq("id", m.id)
    .not("email_message_id", "is", null)
    .order("created_at", { ascending: true });

  const chainList =
    (chain as Array<{ email_message_id: string | null; source: string }> | null) ?? [];

  if (references.length === 0 && chainList.length > 0) {
    references = chainList
      .map((row) => row.email_message_id)
      .filter((id): id is string => !!id);
  }

  if (!inReplyTo) {
    // Last inbound — последнее, на что отвечаем содержательно.
    const lastInbound = [...chainList].reverse().find((row) => row.source === "email_internal");
    if (lastInbound?.email_message_id) {
      inReplyTo = lastInbound.email_message_id;
    } else if (references.length > 0) {
      // Нет входящих — берём последнее из всех (например, наше же).
      inReplyTo = references[references.length - 1];
    }
  }

  const senderName = m.sender_name?.trim() || "ClientCase";

  // Определяем, первое ли это исходящее в треде. Если у нас уже есть
  // хоть одно email-сообщение (любое — входящее или исходящее) — то это reply,
  // ставим "Re: <root>". Если в треде ещё нет email-сообщений — это первое
  // письмо, тема идёт как есть из email_subject_root / m.email_subject.
  let isReply = !!inReplyTo
  if (!isReply) {
    const { count: emailHistoryCount } = await service
      .from("project_messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", t.id)
      .in("source", ["email", "email_internal"])
      .neq("id", m.id)
    isReply = (emailHistoryCount ?? 0) > 0
  }

  const subjectRoot = (t.email_subject_root ?? m.email_subject ?? "").trim() || "(без темы)"
  const subjectRaw = isReply ? `Re: ${subjectRoot.replace(/^\s*Re:\s*/i, "")}` : subjectRoot
  const htmlInner = wrapPlainAsHtmlIfNeeded(m.content ?? "");
  const html = wrapEmailHtml(htmlInner);
  const text = htmlToPlainText(htmlInner);

  // Метод отправки: явный на сообщении/треде, иначе авто (есть account → Gmail, иначе Resend)
  const tExt = t as unknown as ThreadRowExt;
  const explicitMethod = m.email_send_method ?? tExt.email_send_method ?? null;
  const sendAccountId = m.email_send_account_id ?? tExt.email_send_account_id ?? null;
  const method =
    explicitMethod === "employee_mailbox"
      ? "employee_mailbox"
      : explicitMethod === "system_postmark"
        ? "system_postmark"
        : sendAccountId
          ? "employee_mailbox"
          : "system_postmark";

  // === ВЕТКА 1: employee_mailbox (через Gmail сотрудника) ===
  if (method === "employee_mailbox" && sendAccountId) {
    const { data: account, error: accErr } = await service
      .from("email_accounts")
      .select(
        "id, user_id, email, access_token, refresh_token, token_expires_at, last_history_id, watch_expires_at, workspace_id, is_active",
      )
      .eq("id", sendAccountId)
      .maybeSingle();
    if (accErr || !account) {
      return jsonRes({ error: "email account not found" }, 404);
    }
    const acc = account as GmailAccountData & { is_active: boolean; workspace_id: string };
    if (!acc.is_active) {
      return jsonRes({ error: "email account inactive" }, 400);
    }

    let accessToken: string;
    try {
      accessToken = await ensureValidGmailToken(service, acc);
    } catch (e) {
      await service
        .from("project_messages")
        .update({ email_delivery_status: "failed", email_send_method: "employee_mailbox" })
        .eq("id", m.id);
      return jsonRes(
        { error: "gmail_token_failed", detail: e instanceof Error ? e.message : String(e) },
        502,
      );
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
    });
    const raw = uint8ArrayToBase64(new TextEncoder().encode(rfc2822))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const sendBody: { raw: string; threadId?: string } = { raw };
    if (existingGmailThreadId) sendBody.threadId = existingGmailThreadId;

    const gmailResp = await fetch(
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
    if (!gmailResp.ok) {
      const errBody = await gmailResp.text().catch(() => "");
      await service
        .from("project_messages")
        .update({ email_delivery_status: "failed", email_send_method: "employee_mailbox" })
        .eq("id", m.id);
      return jsonRes(
        { error: "gmail_send_failed", status: gmailResp.status, detail: errBody.slice(0, 500) },
        502,
      );
    }
    // Сохраняем gmail_thread_id чтобы gmail-webhook смог сматчить
    // ответ клиента (Pub/Sub-уведомление приходит на наш Gmail и
    // gmail-webhook ищет тред по project_thread_email_links.gmail_thread_id).
    const gmailJson = (await gmailResp.json().catch(() => ({}))) as {
      threadId?: string;
      id?: string;
    };
    const gmailThreadId = gmailJson.threadId ?? null;

    await service
      .from("project_messages")
      .update({
        email_message_id: messageIdHeader,
        email_send_method: "employee_mailbox",
        email_send_account_id: sendAccountId,
        email_delivery_status: "sent",
        email_subject: subjectRaw,
      })
      .eq("id", m.id);

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
    });
  }

  // === ВЕТКА 2: system_postmark (через Resend от t+<id>@<slug>) ===
  const fromAddress = `t+${t.short_id}@${w.slug}.${ROOT_DOMAIN}`;
  const messageIdHeader = `<${crypto.randomUUID()}@${w.slug}.${ROOT_DOMAIN}>`;

  const headers: Record<string, string> = { "Message-ID": messageIdHeader };
  if (inReplyTo) headers["In-Reply-To"] = inReplyTo;
  if (references.length) headers["References"] = references.join(" ");

  const resendBody = {
    from: `"${escapeFromName(senderName)}" <${fromAddress}>`,
    to: [t.email_last_external_address],
    subject: subjectRaw,
    html,
    text,
    headers,
  };

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
    await service
      .from("project_messages")
      .update({
        email_delivery_status: "failed",
        email_send_method: "system_postmark",
      })
      .eq("id", m.id);
    return jsonRes(
      { error: "resend_send_failed", status: resp.status, detail: errBody.slice(0, 500) },
      502,
    );
  }

  const result = await resp.json().catch(() => ({} as Record<string, unknown>));
  const resendId = (result as { id?: string }).id ?? null;

  await service
    .from("project_messages")
    .update({
      email_message_id: messageIdHeader,
      email_resend_id: resendId,
      email_send_method: "system_postmark",
      email_delivery_status: "sent",
      email_subject: subjectRaw,
    })
    .eq("id", m.id);

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
  });
});

// =============================================================
// helpers
// =============================================================

function wrapPlainAsHtmlIfNeeded(content: string): string {
  if (!content) return "<p></p>";
  if (/<[a-z][\s\S]*?>/i.test(content)) return content;
  // plain text → escape + wrap в <p>
  const escaped = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  return `<p>${escaped}</p>`;
}

/**
 * Оборачиваем тело письма в полноценный HTML-документ с базовыми
 * inline-стилями. Без них Gmail и Outlook схлопывают цитаты в одну
 * строку (blockquote без бордера/отступов выглядит как обычный текст).
 */
function wrapEmailHtml(body: string): string {
  // Прокидываем стили на blockquote в стиле Gmail (вертикальная серая полоска,
  // отступ слева). Tiptap отдаёт <blockquote><p>...</p></blockquote> без стилей.
  const styledBody = body.replace(
    /<blockquote(\s[^>]*)?>/gi,
    `<blockquote style="margin:0 0 0 0.8ex;border-left:1px solid #ccc;padding-left:1ex;color:#555">`,
  );
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">${styledBody}</body></html>`;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** В заголовке From "..." нужно избежать кавычек/CR/LF в имени отправителя. */
function escapeFromName(name: string): string {
  return name.replace(/["\r\n]/g, " ").trim();
}

/**
 * Минимальный RFC2822 message с multipart/alternative (text + html)
 * для отправки через Gmail API users.messages.send.
 *
 * Subject и Имя кодируются в RFC2047 (UTF-8 base64) — иначе кириллица будет
 * битой в Gmail клиенте получателя.
 */
function buildRfc2822(opts: {
  fromName: string;
  fromAddress: string;
  to: string;
  subject: string;
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  html: string;
  text: string;
}): string {
  const altBoundary = `alt_${crypto.randomUUID().replace(/-/g, "")}`;
  const lines: string[] = [];
  lines.push(`From: ${rfc2047EncodeName(opts.fromName)} <${opts.fromAddress}>`);
  lines.push(`To: ${opts.to}`);
  lines.push(`Subject: ${rfc2047Encode(opts.subject)}`);
  lines.push(`Message-ID: ${opts.messageId}`);
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references.length) lines.push(`References: ${opts.references.join(" ")}`);
  lines.push(`MIME-Version: 1.0`);
  lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
  lines.push(``);
  lines.push(`--${altBoundary}`);
  lines.push(`Content-Type: text/plain; charset=UTF-8`);
  lines.push(`Content-Transfer-Encoding: base64`);
  lines.push(``);
  lines.push(toBase64(opts.text));
  lines.push(``);
  lines.push(`--${altBoundary}`);
  lines.push(`Content-Type: text/html; charset=UTF-8`);
  lines.push(`Content-Transfer-Encoding: base64`);
  lines.push(``);
  lines.push(toBase64(opts.html));
  lines.push(``);
  lines.push(`--${altBoundary}--`);
  return lines.join("\r\n");
}

function toBase64(s: string): string {
  return uint8ArrayToBase64(new TextEncoder().encode(s));
}

/** RFC 2047 encoded-word для не-ASCII значений (например, кириллицы в Subject). */
function rfc2047Encode(value: string): string {
  // Если только ASCII — оставляем как есть
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${toBase64(value)}?=`;
}

/** Кавычит и (если надо) кодирует имя для From. */
function rfc2047EncodeName(name: string): string {
  const cleaned = escapeFromName(name);
  if (/^[\x20-\x7e]*$/.test(cleaned)) return `"${cleaned}"`;
  return rfc2047Encode(cleaned);
}
