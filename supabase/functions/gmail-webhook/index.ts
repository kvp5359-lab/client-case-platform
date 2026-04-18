/**
 * Edge Function: gmail-webhook
 * Receives push notifications from Google Pub/Sub when new emails arrive.
 * No JWT verification — called by Google, not by users.
 */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { ensureValidGmailToken, type GmailAccountData } from "../_shared/gmailToken.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface GmailHeader { name: string; value: string; }
interface GmailMessagePart { mimeType: string; headers?: GmailHeader[]; body?: { data?: string; size?: number; attachmentId?: string }; filename?: string; parts?: GmailMessagePart[]; }
interface GmailMessage { id: string; threadId: string; labelIds?: string[]; payload: GmailMessagePart; internalDate: string; }

function getHeader(headers: GmailHeader[] | undefined, name: string): string {
  if (!headers) return "";
  const header = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value || "";
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch { return ""; }
}

function extractBody(part: GmailMessagePart): { text: string; html: string } {
  let text = "", html = "";
  if (part.mimeType === "text/plain" && part.body?.data) text = decodeBase64Url(part.body.data);
  else if (part.mimeType === "text/html" && part.body?.data) html = decodeBase64Url(part.body.data);
  if (part.parts) { for (const sub of part.parts) { const s = extractBody(sub); if (s.text) text = text || s.text; if (s.html) html = html || s.html; } }
  return { text, html };
}

function extractAttachments(part: GmailMessagePart): Array<{ name: string; size: number; mimeType: string; gmailAttachmentId: string; }> {
  const atts: Array<{ name: string; size: number; mimeType: string; gmailAttachmentId: string; }> = [];
  if (part.filename && part.body?.attachmentId) atts.push({ name: part.filename, size: part.body.size || 0, mimeType: part.mimeType, gmailAttachmentId: part.body.attachmentId });
  if (part.parts) for (const sub of part.parts) atts.push(...extractAttachments(sub));
  return atts;
}

function stripEmailQuotes(text: string): string {
  let result = text;
  const patterns = [
    /\s*On\s+.{10,80}wrote:\s*/,
    /\s*(?:пн|вт|ср|чт|пт|сб|вс)[,.\s].{10,80}(?:<[^>]+>|@).{0,20}:\s*/,
    /\s*\d{1,2}[\s./-]\S{2,10}[\s./-]\d{4}\s*.{0,20}(?:в|at)\s+\d{1,2}:\d{2}.{0,50}(?:<[^>]+>|@).{0,20}:\s*/,
    /\n-- \n/,
  ];
  for (const p of patterns) { const m = result.match(p); if (m && m.index !== undefined && m.index > 0) { result = result.substring(0, m.index); break; } }
  const lines = result.split("\n");
  while (lines.length > 0 && /^\s*>/.test(lines[lines.length - 1])) lines.pop();
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines.join("\n").trim() || text.trim();
}

function stripHtmlQuotes(html: string): string {
  let result = html;
  // Remove full <html>/<head>/<body> wrappers
  result = result.replace(/^[\s\S]*<body[^>]*>/i, "");
  result = result.replace(/<\/body>[\s\S]*$/i, "");
  // Remove <style> blocks
  result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  // Remove Gmail-specific quote containers (class contains "gmail_quote")
  result = result.replace(/<div[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>[\s\S]*$/i, "");
  // Remove standalone <blockquote> with quoted content
  result = result.replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, "");
  // Remove trailing <br> tags left after quote removal
  result = result.replace(/(<br\s*\/?\s*>)+$/gi, "");
  // Remove tracking pixels (1x1 images)
  result = result.replace(/<img[^>]*(?:width=["']1["']|height=["']1["'])[^>]*>/gi, "");
  // Remove empty trailing divs/paragraphs
  result = result.replace(/(<div[^>]*>\s*<\/div>\s*|<p[^>]*>\s*<\/p>\s*|<br\s*\/?>)+$/gi, "");
  return result.trim() || html.trim();
}

function decodeRfc2047(value: string): string {
  return value.replace(/=\?([^?]+)\?(B|Q)\?([^?]+)\?=/gi, (_, charset, encoding, encoded) => {
    try {
      if (encoding.toUpperCase() === "B") {
        const b = atob(encoded); const bytes = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
        return new TextDecoder(charset).decode(bytes);
      } else {
        const d = encoded.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_: string, h: string) => String.fromCharCode(parseInt(h, 16)));
        const bytes = new Uint8Array(d.length); for (let i = 0; i < d.length; i++) bytes[i] = d.charCodeAt(i);
        return new TextDecoder(charset).decode(bytes);
      }
    } catch { return encoded; }
  });
}

function extractEmail(f: string): string { const m = f.match(/<([^>]+)>/); return m ? m[1] : f.trim(); }
function extractName(f: string): string { const m = f.match(/^"?([^"<]+)"?\s*</); return m ? m[1].trim() : extractEmail(f); }
function parseEmailList(h: string): string[] { if (!h) return []; return h.split(",").map((e) => extractEmail(e.trim())).filter(Boolean); }

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let pubsubData: { emailAddress?: string; historyId?: string } | null = null;
  try {
    const body = await req.json();
    const messageData = body?.message?.data;
    if (!messageData) return new Response("ok", { status: 200 });
    try { pubsubData = JSON.parse(atob(messageData)); } catch { return new Response("ok", { status: 200 }); }
    if (!pubsubData?.emailAddress) return new Response("ok", { status: 200 });
    const emailAddress = pubsubData.emailAddress;
    console.log(`[gmail-webhook] Notification for ${emailAddress}`);
    const { data: account, error: ae } = await serviceClient.from("email_accounts")
      .select("id, user_id, email, access_token, refresh_token, token_expires_at, last_history_id, watch_expires_at, workspace_id")
      .eq("email", emailAddress).eq("is_active", true).maybeSingle();
    if (ae || !account) return new Response("ok", { status: 200 });
    const accessToken = await ensureValidGmailToken(serviceClient, account as GmailAccountData);
    const startHistoryId = account.last_history_id;
    if (!startHistoryId) {
      if (pubsubData.historyId) await serviceClient.from("email_accounts").update({ last_history_id: pubsubData.historyId }).eq("id", account.id);
      return new Response("ok", { status: 200 });
    }
    const hr = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded&labelIds=INBOX`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!hr.ok) {
      if (hr.status === 404 && pubsubData.historyId) await serviceClient.from("email_accounts").update({ last_history_id: pubsubData.historyId }).eq("id", account.id);
      return new Response("ok", { status: 200 });
    }
    const hd = await hr.json();
    const messageIds = new Set<string>();
    for (const h of hd.history || []) for (const a of h.messagesAdded || []) {
      if (a.message.labelIds?.includes("SENT") && !a.message.labelIds?.includes("INBOX")) continue;
      messageIds.add(a.message.id);
    }
    console.log(`[gmail-webhook] ${messageIds.size} new messages for ${emailAddress}`);
    for (const mid of messageIds) { try { await processGmailMessage(serviceClient, accessToken, mid, account); } catch (e) { console.error(`[gmail-webhook] Error:`, e); } }
    const newHid = hd.historyId || pubsubData.historyId;
    if (newHid) await serviceClient.from("email_accounts").update({ last_history_id: String(newHid), updated_at: new Date().toISOString() }).eq("id", account.id);
    return new Response("ok", { status: 200 });
  } catch (error) { console.error("[gmail-webhook] Unhandled:", error); return new Response("ok", { status: 200 }); }
});

async function processGmailMessage(sc: SupabaseClient, accessToken: string, gmailMessageId: string, account: GmailAccountData & { workspace_id: string }) {
  const { data: existing } = await sc.from("project_messages").select("id").eq("source", "email").filter("email_metadata->>gmail_message_id", "eq", gmailMessageId).maybeSingle();
  if (existing) return;
  const mr = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailMessageId}?format=full`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!mr.ok) return;
  const msg: GmailMessage = await mr.json();
  const hdrs = msg.payload.headers || [];
  const fromHeader = decodeRfc2047(getHeader(hdrs, "From"));
  const subject = decodeRfc2047(getHeader(hdrs, "Subject"));
  const messageIdHeader = getHeader(hdrs, "Message-ID");
  const inReplyTo = getHeader(hdrs, "In-Reply-To");
  const fromEmail = extractEmail(fromHeader);
  const fromName = extractName(fromHeader);
  const toEmails = parseEmailList(getHeader(hdrs, "To"));
  const ccEmails = parseEmailList(getHeader(hdrs, "Cc"));
  if (fromEmail.toLowerCase() === account.email.toLowerCase()) return;

  const { text, html } = extractBody(msg.payload);
  let content: string;
  if (html) { content = stripHtmlQuotes(html); } else { content = stripEmailQuotes(text || "(empty message)"); }

  const attachments = extractAttachments(msg.payload);
  const { data: el } = await sc.from("project_thread_email_links").select("thread_id, contact_email").eq("gmail_thread_id", msg.threadId).eq("is_active", true).maybeSingle();
  let threadId: string | null = el?.thread_id || null;
  let projectId: string | null = null;
  if (!threadId) {
    const { data: elc } = await sc.from("project_thread_email_links").select("thread_id, contact_email").eq("contact_email", fromEmail.toLowerCase()).eq("is_active", true).maybeSingle();
    if (elc) { threadId = elc.thread_id; await sc.from("project_thread_email_links").update({ gmail_thread_id: msg.threadId }).eq("thread_id", threadId); }
  }
  if (threadId) { const { data: t } = await sc.from("project_threads").select("project_id").eq("id", threadId).single(); projectId = t?.project_id || null; }

  const emailMetadata = { gmail_message_id: gmailMessageId, message_id_header: messageIdHeader, in_reply_to: inReplyTo || null, from_email: fromEmail, to_emails: toEmails, cc_emails: ccEmails, subject, body_html: html || null, attachments: attachments.length > 0 ? attachments : null };
  const insertData: Record<string, unknown> = { workspace_id: account.workspace_id, sender_participant_id: null, sender_name: fromName, sender_role: "Email", content, source: "email", thread_id: threadId, email_metadata: emailMetadata, has_attachments: attachments.length > 0 };
  if (projectId) insertData.project_id = projectId;
  if (!projectId && !threadId) { console.log(`[gmail-webhook] Unlinked email from ${fromEmail}: "${subject}"`); return; }

  const { data: inserted, error: ie } = await sc.from("project_messages").insert(insertData).select("id").single();
  if (ie || !inserted) { console.error(`[gmail-webhook] Insert failed:`, ie); return; }

  if (attachments.length > 0) {
    for (const att of attachments) {
      try {
        const ar = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailMessageId}/attachments/${att.gmailAttachmentId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!ar.ok) continue;
        const ad = await ar.json(); if (!ad.data) continue;
        const b64 = ad.data.replace(/-/g, "+").replace(/_/g, "/"); const bs = atob(b64);
        const bytes = new Uint8Array(bs.length); for (let i = 0; i < bs.length; i++) bytes[i] = bs.charCodeAt(i);
        const ext = att.name.includes(".") ? "." + att.name.split(".").pop() : "";
        const sp = `${account.workspace_id}/${projectId}/email-attachments/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
        const { error: ue } = await sc.storage.from("files").upload(sp, bytes, { upsert: false, contentType: att.mimeType || "application/octet-stream" });
        if (ue) continue;
        const { data: fr } = await sc.from("files").insert({ workspace_id: account.workspace_id, bucket: "files", storage_path: sp, file_name: att.name, file_size: bytes.length, mime_type: att.mimeType || "application/octet-stream" }).select("id").single();
        if (!fr) continue;
        await sc.from("message_attachments").insert({ message_id: inserted.id, file_name: att.name, file_size: bytes.length, mime_type: att.mimeType || "application/octet-stream", storage_path: sp, file_id: fr.id });
        console.log(`[gmail-webhook] Saved attachment: ${att.name} (${bytes.length} bytes)`);
      } catch (e) { console.error(`[gmail-webhook] Attachment error ${att.name}:`, e); }
    }
  }
  console.log(`[gmail-webhook] Saved email from ${fromEmail} → thread ${threadId || "unlinked"}: "${subject}"`);
}
