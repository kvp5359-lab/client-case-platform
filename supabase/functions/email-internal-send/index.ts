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
    .select("id, short_id, email_subject_root, email_last_external_address")
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
  let inReplyTo = m.email_in_reply_to;
  let references: string[] = m.email_references ?? [];
  if (!inReplyTo) {
    const { data: lastInbound } = await service
      .from("project_messages")
      .select("email_message_id")
      .eq("thread_id", t.id)
      .eq("source", "email_internal")
      .neq("id", m.id)
      .not("email_message_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastId = (lastInbound as { email_message_id: string | null } | null)?.email_message_id ?? null;
    if (lastId) {
      inReplyTo = lastId;
      if (references.length === 0) references = [lastId];
    }
  }

  const fromAddress = `t+${t.short_id}@${w.slug}.${ROOT_DOMAIN}`;
  const senderName = m.sender_name?.trim() || "ClientCase";
  const subjectRaw = t.email_subject_root
    ? `Re: ${t.email_subject_root}`
    : (m.email_subject?.trim() || "(без темы)");
  const messageIdHeader = `<${crypto.randomUUID()}@${w.slug}.${ROOT_DOMAIN}>`;

  const html = wrapPlainAsHtmlIfNeeded(m.content ?? "");
  const text = htmlToPlainText(html);

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
