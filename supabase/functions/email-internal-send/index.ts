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
  preflight, jsonRes, requireInternalSecret, getServiceClient, getUser,
  INTERNAL_FUNCTION_SECRET, SUPABASE_URL,
} from "../_shared/edge.ts";
import { ensureValidGmailToken, type GmailAccountData } from "../_shared/gmailToken.ts";
import { uint8ArrayToBase64 } from "../_shared/encoding.ts";
import { markMessageSent, markMessageFailed } from "../_shared/messageSendStatus.ts";

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
  created_at: string;
}

interface ThreadRow {
  id: string;
  short_id: number | null;
  email_subject_root: string | null;
  email_last_external_address: string | null;
  email_send_account_id: string | null;
  email_send_method: string | null;
}

interface WorkspaceRow {
  id: string;
  slug: string;
  email_active: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return jsonRes({ error: "method not allowed" }, 405, req);
  if (!requireInternalSecret(req, true)) {
    return jsonRes({ error: "unauthorized" }, 401, req);
  }
  if (!RESEND_API_KEY) return jsonRes({ error: "RESEND_API_KEY missing" }, 500, req);

  let body: { message_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonRes({ error: "invalid json" }, 400, req);
  }
  if (!body.message_id) return jsonRes({ error: "message_id required" }, 400, req);

  const service = getServiceClient();

  const { data: msg, error: msgErr } = await service
    .from("project_messages")
    .select(
      "id, content, sender_name, has_attachments, email_in_reply_to, email_references, email_subject, email_send_method, email_send_account_id, thread_id, workspace_id, created_at",
    )
    .eq("id", body.message_id)
    .maybeSingle();
  if (msgErr) return jsonRes({ error: "load_failed", detail: msgErr.message }, 500, req);
  if (!msg) return jsonRes({ error: "message not found" }, 404, req);
  if (!msg.thread_id) return jsonRes({ error: "message has no thread_id" }, 400, req);
  const m = msg as MessageRow;

  // verify_jwt=false → шлюз Bearer не проверяет, а requireInternalSecret(req, true)
  // пропускает любой "Bearer ..." по префиксу. Для фронт-пути (attachments_only)
  // валидируем JWT по-настоящему и проверяем членство в воркспейсе сообщения.
  const viaInternalSecret =
    !!INTERNAL_FUNCTION_SECRET &&
    req.headers.get("x-internal-secret") === INTERNAL_FUNCTION_SECRET;
  if (!viaInternalSecret) {
    const user = await getUser(req);
    if (!user) return jsonRes({ error: "unauthorized" }, 401, req);
    const { data: member } = await service
      .from("participants")
      .select("id")
      .eq("user_id", user.id)
      .eq("workspace_id", m.workspace_id)
      .eq("is_deleted", false)
      .limit(1)
      .maybeSingle();
    if (!member) return jsonRes({ error: "forbidden" }, 403, req);
  }

  const { data: thread, error: threadErr } = await service
    .from("project_threads")
    .select(
      "id, short_id, email_subject_root, email_last_external_address, email_send_account_id, email_send_method",
    )
    .eq("id", m.thread_id)
    .maybeSingle();
  if (threadErr || !thread) {
    return jsonRes({ error: "thread not found" }, 404, req);
  }
  const t = thread as ThreadRow;
  if (t.short_id == null) return jsonRes({ error: "thread has no short_id" }, 400, req);
  // Fallback: тред мог быть создан без явного email_last_external_address
  // (например, исходящий email сделан из chat-треда коллегой). Тогда
  // достаём адрес получателя из email_metadata последнего email-сообщения.
  // Направление определяем по sender_participant_id: NOT NULL → исходящее
  // (отправлено сотрудником), берём to_emails[0]; NULL → входящее, берём
  // from_email. Полагаться на source нельзя: старые исходящие пишутся как
  // source='email' (через gmail-send), новые — source='web'/'email_internal'.
  let recipientEmail: string | null = t.email_last_external_address;
  if (!recipientEmail) {
    const { data: lastEmailMsg } = await service
      .from("project_messages")
      .select("email_metadata, sender_participant_id")
      .eq("thread_id", m.thread_id)
      .not("email_metadata", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);
    for (const row of (lastEmailMsg ?? []) as Array<{ email_metadata: Record<string, unknown> | null; sender_participant_id: string | null }>) {
      const meta = row.email_metadata;
      if (!meta) continue;
      const isOutgoing = row.sender_participant_id !== null;
      if (isOutgoing) {
        const to = meta["to_emails"];
        if (Array.isArray(to) && typeof to[0] === "string" && to[0]) {
          recipientEmail = to[0];
          break;
        }
      } else {
        const from = meta["from_email"];
        if (typeof from === "string" && from) {
          recipientEmail = from;
          break;
        }
      }
    }
    if (recipientEmail) {
      // Подкладываем в тред, чтобы следующие отправки шли быстрым путём.
      await service
        .from("project_threads")
        .update({ email_last_external_address: recipientEmail })
        .eq("id", m.thread_id);
      console.log(`[email-internal-send] backfilled email_last_external_address for thread ${m.thread_id}: ${recipientEmail}`);
    }
  }
  if (!recipientEmail) {
    return jsonRes({ error: "thread has no recipient (email_last_external_address)" }, 400, req);
  }
  // Подменяем для остальной части функции.
  (t as { email_last_external_address: string }).email_last_external_address = recipientEmail;

  const { data: ws, error: wsErr } = await service
    .from("workspaces")
    .select("id, slug, email_active")
    .eq("id", m.workspace_id)
    .maybeSingle();
  if (wsErr || !ws) return jsonRes({ error: "workspace not found" }, 404, req);
  const w = ws as WorkspaceRow;
  if (!w.email_active) {
    return jsonRes({ error: "workspace email not active" }, 400, req);
  }
  if (!w.slug) return jsonRes({ error: "workspace has no slug" }, 400, req);

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

  // Race-condition: если юзер шлёт 2 письма подряд, edge-function для второго
  // стартует пока первое ещё в полёте и у него не записан email_message_id.
  // Ждём до 6 сек, пока предыдущее наше исходящее не получит email_message_id —
  // иначе второе уходит без In-Reply-To и Gmail получателя отделяет его
  // в новый тред.
  for (let i = 0; i < 6; i++) {
    const { data: pending } = await service
      .from("project_messages")
      .select("id")
      .eq("thread_id", t.id)
      .neq("id", m.id)
      .lt("created_at", m.created_at)
      .is("email_message_id", null)
      .in("source", ["web", "email"])
      .limit(1)
      .maybeSingle();
    if (!pending) break;
    await new Promise((res) => setTimeout(res, 1000));
  }

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
  // «Re:» ставим только когда отвечаем на письмо клиента (source='email_internal').
  // Если в треде только наши исходящие (followup без ответа клиента) — Subject
  // должен повторять оригинал, иначе Gmail при users.messages.send с threadId
  // видит «несовпадение Subject» и отделяет письмо в новый тред у получателя.
  const hasInboundFromClient = chainList.some((row) => row.source === "email_internal")
  const isReply = hasInboundFromClient

  // Fallback на subject из email_metadata: тред мог быть создан без явного
  // email_subject_root (отправка из chat-треда коллегой). Тогда берём
  // тему из последнего email-сообщения треда и backfillим в тред.
  // Считаем «пустыми» темами литералы (без темы)/(no subject) — раньше они
  // могли попадать в БД при отправке без явной темы и блокировать fallback.
  const isBlankSubject = (s: string | null | undefined): boolean => {
    const v = (s ?? "").trim();
    if (!v) return true;
    return /^\(?\s*(без\s+темы|no\s+subject)\s*\)?$/i.test(v);
  };
  let resolvedSubjectRoot = isBlankSubject(t.email_subject_root)
    ? (isBlankSubject(m.email_subject) ? "" : (m.email_subject ?? "").trim())
    : (t.email_subject_root ?? "").trim();
  if (!resolvedSubjectRoot) {
    const { data: lastSubjMsg } = await service
      .from("project_messages")
      .select("email_metadata")
      .eq("thread_id", m.thread_id)
      .not("email_metadata", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);
    for (const row of (lastSubjMsg ?? []) as Array<{ email_metadata: Record<string, unknown> | null }>) {
      const meta = row.email_metadata;
      if (!meta) continue;
      const subj = typeof meta["subject"] === "string" ? (meta["subject"] as string) : null;
      if (!subj) continue;
      const cleaned = subj.trim().replace(/^\s*Re:\s*/i, "").trim();
      // Игнорируем «пустые» темы — раньше в metadata могло прийти буквально "(без темы)"
      // или "(no subject)"; такие тоже считаем мусором, иначе backfill закрепит их в треде.
      if (!cleaned) continue;
      if (/^\(?\s*(без\s+темы|no\s+subject)\s*\)?$/i.test(cleaned)) continue;
      resolvedSubjectRoot = cleaned;
      break;
    }
    if (resolvedSubjectRoot) {
      await service
        .from("project_threads")
        .update({ email_subject_root: resolvedSubjectRoot })
        .eq("id", m.thread_id);
      console.log(`[email-internal-send] backfilled email_subject_root for thread ${m.thread_id}: ${resolvedSubjectRoot}`);
    }
  }
  const subjectRoot = resolvedSubjectRoot || "(без темы)"
  const subjectRaw = isReply ? `Re: ${subjectRoot.replace(/^\s*Re:\s*/i, "")}` : subjectRoot
  const htmlInner = wrapPlainAsHtmlIfNeeded(m.content ?? "");
  // 1×1 tracking pixel — клиент-почтовик скачает картинку при открытии,
  // email-track edge-функция выставит email_metadata.read_at, и UI покажет
  // двойную галочку. Gmail проксирует картинки через свой CDN — пиксель
  // часто срабатывает уже при доставке (а не строго при открытии), но это
  // лучшее доступное приближение.
  const trackingPixel = `<img src="${SUPABASE_URL}/functions/v1/email-track?id=${m.id}" width="1" height="1" alt="" style="display:none;border:0" />`;
  const html = wrapEmailHtml(htmlInner + trackingPixel);
  const text = htmlToPlainText(htmlInner);

  // Грузим вложения: filename, mime, bytes (для Gmail RFC2822) и base64 (для Resend).
  interface OutboundAttachment {
    filename: string;
    mime: string;
    bytes: Uint8Array;
    base64: string;
  }
  const attachments: OutboundAttachment[] = [];
  if (m.has_attachments) {
    // Триггер БД с has_attachments=true делает early-return (см. миграцию
    // 20260521_email_attachments_race_fix.sql). Эту функцию зовёт сам
    // фронт после uploadAttachments — данные в message_attachments уже
    // гарантированно записаны, polling не нужен.
    const { data } = await service
      .from("message_attachments")
      .select("file_name, mime_type, storage_path")
      .eq("message_id", m.id);
    const rows = (data ?? []) as Array<{ file_name: string; mime_type: string; storage_path: string }>;

    // Параллельная загрузка: вместо последовательного цикла гоняем все
    // downloads через Promise.all. На 9 файлах из Storage экономит секунды
    // wall-time и снижает риск WORKER_RESOURCE_LIMIT по таймауту.
    const downloaded = await Promise.all(
      rows.map(async (row) => {
        const { data: blob, error: dlErr } = await service.storage
          .from("files")
          .download(row.storage_path);
        if (dlErr || !blob) {
          console.error("[email-internal-send] attachment download failed:", row.storage_path, dlErr);
          return null;
        }
        const buf = new Uint8Array(await blob.arrayBuffer());
        return {
          filename: row.file_name,
          mime: row.mime_type || "application/octet-stream",
          bytes: buf,
          base64: uint8ArrayToBase64(buf),
        };
      }),
    );
    for (const a of downloaded) {
      if (a) attachments.push(a);
    }
  }

  // Метод отправки: явный на сообщении/треде, иначе авто (есть account → Gmail, иначе Resend)
  const explicitMethod = m.email_send_method ?? t.email_send_method ?? null;
  const sendAccountId = m.email_send_account_id ?? t.email_send_account_id ?? null;
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

    const sendBody: { raw: string; threadId?: string } = { raw };
    if (existingGmailThreadId) sendBody.threadId = existingGmailThreadId;

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

  // === ВЕТКА 2: system_postmark (через Resend от t+<id>@<slug>) ===
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
  attachments?: Array<{ filename: string; mime: string; bytes: Uint8Array; base64: string }>;
}): string {
  const altBoundary = `alt_${crypto.randomUUID().replace(/-/g, "")}`;
  const mixedBoundary = `mix_${crypto.randomUUID().replace(/-/g, "")}`;
  const hasAttachments = (opts.attachments?.length ?? 0) > 0;
  const lines: string[] = [];
  lines.push(`From: ${rfc2047EncodeName(opts.fromName)} <${opts.fromAddress}>`);
  lines.push(`To: ${opts.to}`);
  lines.push(`Subject: ${rfc2047Encode(opts.subject)}`);
  lines.push(`Message-ID: ${opts.messageId}`);
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references.length) lines.push(`References: ${opts.references.join(" ")}`);
  lines.push(`MIME-Version: 1.0`);

  if (hasAttachments) {
    lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
    lines.push(``);
    lines.push(`--${mixedBoundary}`);
    lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    lines.push(``);
  } else {
    lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    lines.push(``);
  }

  // Body — text + html alternative
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

  if (hasAttachments) {
    for (const att of opts.attachments!) {
      lines.push(``);
      lines.push(`--${mixedBoundary}`);
      lines.push(`Content-Type: ${att.mime}; name="${rfc2047Encode(att.filename)}"`);
      lines.push(`Content-Disposition: attachment; filename="${rfc2047Encode(att.filename)}"`);
      lines.push(`Content-Transfer-Encoding: base64`);
      lines.push(``);
      // RFC 2045 рекомендует base64 в строках по 76 символов
      const wrapped = att.base64.replace(/(.{76})/g, "$1\r\n");
      lines.push(wrapped);
    }
    lines.push(``);
    lines.push(`--${mixedBoundary}--`);
  }

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
