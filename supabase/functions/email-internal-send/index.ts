/**
 * Edge Function: email-internal-send
 *
 * Отправка исходящего письма из ClientCase в email-треде.
 *
 * Вызывается БД-триггером notify_telegram_on_new_message (через net.http_post),
 * когда тред считается email-каналом — `pt.email_send_account_id` IS NOT NULL
 * ИЛИ в треде уже есть сообщения с `source='email_internal'`.
 *
 * Два транспорта (email-transports.ts): `employee_mailbox` (Gmail сотрудника,
 * users.messages.send) и `system_postmark` (Resend с адреса
 * `t+<short_id>@<slug>.clientcase.app`). Выбор — по email_send_method/аккаунту.
 * Форматирование письма (HTML/текст/RFC2822) — email-format.ts, типы — email-types.ts.
 *
 * Auth: deploy с `--no-verify-jwt`, защита `x-internal-secret` header
 * (или Bearer JWT для будущего ручного дёргания из фронта).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { isInternalVisibility } from "../_shared/outgoing.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import {
  preflight, jsonRes, requireInternalSecret, getServiceClient, getUser,
  INTERNAL_FUNCTION_SECRET, SUPABASE_URL,
} from "../_shared/edge.ts";
import { uint8ArrayToBase64 } from "../_shared/encoding.ts";
import { markMessageSent, markMessageFailed } from "../_shared/messageSendStatus.ts";
import { storageDownload } from "../_shared/storage.ts";
import { resolveAttachmentLocation } from "../_shared/storageHelpers.ts";
import { wrapPlainAsHtmlIfNeeded, wrapEmailHtml, htmlToPlainText } from "./email-format.ts";
import type {
  MessageRow, ThreadRow, WorkspaceRow, OutboundAttachment, OutboundEmailCtx,
} from "./email-types.ts";
import { sendViaEmployeeMailbox, sendViaResend, RESEND_API_KEY } from "./email-transports.ts";

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
      "id, content, sender_name, has_attachments, email_in_reply_to, email_references, email_subject, email_send_method, email_send_account_id, thread_id, workspace_id, created_at, visibility",
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
    if (!(await checkWorkspaceMembership(service, user.id, m.workspace_id))) {
      return jsonRes({ error: "forbidden" }, 403, req);
    }
  }

  // 🔒 Backstop: НЕ отправляем во внешний канал внутренние сообщения (team/self/
  // «Заметка»). Фронт уже гейтит внешнюю доставку по visibility, это защита
  // на уровне канала — утечка внутреннего сообщения клиенту критична
  // (баг 2026-07-08: внутреннее сообщение с файлом ушло клиенту в группу).
  if (isInternalVisibility(m.visibility)) {
    await markMessageSent(service, m.id, { channelFields: {} });
    return jsonRes({ ok: true, skipped: "internal_visibility" }, 200, req);
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
  const attachments: OutboundAttachment[] = [];
  if (m.has_attachments) {
    // Триггер БД с has_attachments=true делает early-return (см. миграцию
    // 20260521_email_attachments_race_fix.sql). Эту функцию зовёт сам
    // фронт после uploadAttachments — данные в message_attachments уже
    // гарантированно записаны, polling не нужен.
    const { data } = await service
      .from("message_attachments")
      .select("file_name, mime_type, storage_path, file_id")
      .eq("message_id", m.id);
    const rows = (data ?? []) as Array<{
      file_name: string;
      mime_type: string;
      storage_path: string;
      file_id: string | null;
    }>;

    // Параллельная загрузка: вместо последовательного цикла гоняем все
    // downloads через Promise.all. На 9 файлах из Storage экономит секунды
    // wall-time и снижает риск WORKER_RESOURCE_LIMIT по таймауту.
    const downloaded = await Promise.all(
      rows.map(async (row) => {
        // Бакет резолвим через реестр `files` с fallback на message-attachments:
        // хардкод `files` терял вложения из личного Telegram (см. 2026-07-22).
        const { bucket, storagePath } = await resolveAttachmentLocation(service, row.storage_path, row.file_id);
        const { data: blob, error: dlErr } = await storageDownload(service, bucket, storagePath);
        if (dlErr || !blob) {
          console.error("[email-internal-send] attachment download failed:", bucket, storagePath, dlErr);
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
    // Не отправляем письмо «наполовину»: если хоть один файл не скачался,
    // валим отправку с понятной причиной. Раньше сбой глотался в console —
    // клиент получал письмо без части вложений, и никто об этом не узнавал.
    const missing = rows.filter((_, i) => !downloaded[i]).map((r) => r.file_name);
    if (missing.length > 0) {
      const reason = `attachments_unavailable: ${missing.join(", ")}`;
      await markMessageFailed(service, m.id, reason, { failureSource: "email-internal-send" });
      return jsonRes({ ok: false, error: reason }, 200, req);
    }
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

  // Контекст вычислен — выбираем канал и делегируем ветке-отправщику.
  const ctx: OutboundEmailCtx = {
    service, m, t, req, senderName, subjectRaw, subjectRoot,
    inReplyTo, references, html, text, attachments,
  };

  if (method === "employee_mailbox" && sendAccountId) {
    return sendViaEmployeeMailbox(ctx, sendAccountId);
  }
  return sendViaResend(ctx, w);
});
