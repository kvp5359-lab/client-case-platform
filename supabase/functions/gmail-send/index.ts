/**
 * Edge Function: gmail-send
 * Sends email via Gmail API on behalf of the current user.
 *
 * POST /gmail-send
 * Authorization: Bearer {supabase_jwt}
 * Body: {
 *   threadId: string,
 *   content: string,
 *   subject?: string,
 *   attachments?: Array<{ storagePath: string, fileName: string, mimeType: string, fileSize: number }>
 * }
 *
 * → Sends email via Gmail API from the user's connected account
 * → Stores in project_messages with source: 'email'
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getValidGmailTokenForUser } from "../_shared/gmailToken.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { isValidUUID } from "../_shared/validation.ts";
import { uint8ArrayToBase64 } from "../_shared/encoding.ts";

interface AttachmentInput {
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Verify user
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { threadId, content, subject: customSubject, attachments: attachmentInputs } = body as {
      threadId: string;
      content: string;
      subject?: string;
      attachments?: AttachmentInput[];
    };

    if (!threadId || !content) {
      return new Response(
        JSON.stringify({ error: "threadId and content are required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    if (!isValidUUID(threadId)) {
      return new Response(
        JSON.stringify({ error: "Invalid threadId format" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Get user's Gmail account
    let accessToken: string;
    let account: { id: string; email: string };
    try {
      const result = await getValidGmailTokenForUser(supabaseAdmin, user.id);
      accessToken = result.accessToken;
      account = result.account;
    } catch {
      return new Response(
        JSON.stringify({ error: "Gmail not connected. Please connect your Gmail in settings." }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Get email link for this thread
    const { data: emailLink, error: linkError } = await supabaseAdmin
      .from("project_thread_email_links")
      .select("id, contact_email, subject, gmail_thread_id")
      .eq("thread_id", threadId)
      .eq("is_active", true)
      .maybeSingle();

    if (linkError || !emailLink) {
      return new Response(
        JSON.stringify({ error: "This chat has no email link" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Get thread and project info
    const { data: thread } = await supabaseAdmin
      .from("project_threads")
      .select("id, project_id, workspace_id")
      .eq("id", threadId)
      .single();

    if (!thread) {
      return new Response(
        JSON.stringify({ error: "Thread not found" }),
        { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Check workspace membership
    const isMember = await checkWorkspaceMembership(supabaseAdmin, user.id, thread.workspace_id);
    if (!isMember) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Get sender's participant info
    const { data: participant } = await supabaseAdmin
      .from("participants")
      .select("id, name")
      .eq("workspace_id", thread.workspace_id)
      .eq("user_id", user.id)
      .eq("is_deleted", false)
      .maybeSingle();

    // Determine subject
    const emailSubject = customSubject || emailLink.subject || "No subject";
    const isReply = !!emailLink.gmail_thread_id;
    const fullSubject = isReply && !emailSubject.startsWith("Re:")
      ? `Re: ${emailSubject}`
      : emailSubject;

    // Build In-Reply-To and References for proper threading
    let inReplyTo = "";
    let references = "";
    if (isReply) {
      const { data: allEmails } = await supabaseAdmin
        .from("project_messages")
        .select("email_metadata")
        .eq("thread_id", threadId)
        .eq("source", "email")
        .not("email_metadata->>message_id_header", "is", null)
        .order("created_at", { ascending: true });

      if (allEmails && allEmails.length > 0) {
        const lastEmail = allEmails[allEmails.length - 1];
        inReplyTo = lastEmail.email_metadata?.message_id_header ?? "";
        const allMessageIds = allEmails
          .map((e: { email_metadata?: { message_id_header?: string } }) => e.email_metadata?.message_id_header)
          .filter(Boolean) as string[];
        references = allMessageIds.join(" ");
      }
    }

    const messageId = `<${crypto.randomUUID()}@sp-propia.com>`;

    function encodeSubjectRfc2047(subject: string): string {
      if (/^[\x20-\x7E]*$/.test(subject)) return subject;
      const encoder = new TextEncoder();
      const bytes = encoder.encode(subject);
      let binary = "";
      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }
      const b64 = btoa(binary);
      return `=?UTF-8?B?${b64}?=`;
    }

    function stripHtml(html: string): string {
      return html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .trim();
    }

    // Pre-generate message ID for tracking pixel
    const messageDbId = crypto.randomUUID();
    const trackingPixelUrl = `${supabaseUrl}/functions/v1/email-track?id=${messageDbId}`;

    const plainContent = stripHtml(content);
    const htmlContent = `<div style="font-family:sans-serif;font-size:14px">${plainContent.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</div><img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" />`;
    const encodedSubject = encodeSubjectRfc2047(fullSubject);

    const hasAttachments = attachmentInputs && attachmentInputs.length > 0;

    const altBoundary = `boundary_alt_${crypto.randomUUID().replace(/-/g, "")}`;
    const mixedBoundary = `boundary_mix_${crypto.randomUUID().replace(/-/g, "")}`;

    const altPart = [
      `--${altBoundary}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      btoa(unescape(encodeURIComponent(plainContent))),
      ``,
      `--${altBoundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      btoa(unescape(encodeURIComponent(htmlContent))),
      ``,
      `--${altBoundary}--`,
    ];

    const attachmentParts: string[] = [];
    if (hasAttachments) {
      for (const att of attachmentInputs) {
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from("files")
          .download(att.storagePath);

        if (downloadError || !fileData) {
          console.error(`[gmail-send] Failed to download attachment ${att.fileName}:`, downloadError);
          continue;
        }

        const fileBase64 = uint8ArrayToBase64(new Uint8Array(await fileData.arrayBuffer()));
        const encodedFileName = encodeSubjectRfc2047(att.fileName);

        attachmentParts.push(
          [
            `--${mixedBoundary}`,
            `Content-Type: ${att.mimeType || "application/octet-stream"}; name="${encodedFileName}"`,
            `Content-Disposition: attachment; filename="${encodedFileName}"`,
            `Content-Transfer-Encoding: base64`,
            ``,
            fileBase64,
            ``,
          ].join("\r\n"),
        );
      }
    }

    let rfc2822Lines: string[];

    if (attachmentParts.length > 0) {
      rfc2822Lines = [
        `From: ${account.email}`,
        `To: ${emailLink.contact_email}`,
        `Subject: ${encodedSubject}`,
        `Message-ID: ${messageId}`,
        ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${references || inReplyTo}`] : []),
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
        ``,
        `--${mixedBoundary}`,
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        ``,
        ...altPart,
        ``,
        ...attachmentParts.map((p) => p),
        `--${mixedBoundary}--`,
      ];
    } else {
      rfc2822Lines = [
        `From: ${account.email}`,
        `To: ${emailLink.contact_email}`,
        `Subject: ${encodedSubject}`,
        `Message-ID: ${messageId}`,
        ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${references || inReplyTo}`] : []),
        `MIME-Version: 1.0`,
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        ``,
        ...altPart,
      ];
    }

    const rawEmail = rfc2822Lines.join("\r\n");

    const rawBytes = new TextEncoder().encode(rawEmail);
    const encoded = uint8ArrayToBase64(rawBytes)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const sendBody: Record<string, string> = { raw: encoded };
    if (emailLink.gmail_thread_id) {
      sendBody.threadId = emailLink.gmail_thread_id;
    }

    const sendResponse = await fetch(
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

    if (!sendResponse.ok) {
      const errText = await sendResponse.text();
      console.error("[gmail-send] Gmail API error:", errText);
      return new Response(
        JSON.stringify({ error: "Failed to send email" }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const sendResult = await sendResponse.json();

    // Fetch the real Message-ID header assigned by Gmail
    let realMessageIdHeader = messageId;
    try {
      const getResp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${sendResult.id}?format=metadata&metadataHeaders=Message-ID`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (getResp.ok) {
        const msgData = await getResp.json();
        const header = msgData.payload?.headers?.find(
          (h: { name: string; value: string }) => h.name.toLowerCase() === "message-id",
        );
        if (header?.value) {
          realMessageIdHeader = header.value;
        }
      }
    } catch {
      // Fall back to our generated messageId
    }

    // Update gmail_thread_id if this is the first message
    if (!emailLink.gmail_thread_id && sendResult.threadId) {
      await supabaseAdmin
        .from("project_thread_email_links")
        .update({ gmail_thread_id: sendResult.threadId })
        .eq("id", emailLink.id);
    }

    // Update subject if first message
    if (!emailLink.subject && emailSubject) {
      await supabaseAdmin
        .from("project_thread_email_links")
        .update({ subject: emailSubject })
        .eq("id", emailLink.id);
    }

    // Build email_metadata
    const emailMetadata = {
      gmail_message_id: sendResult.id,
      message_id_header: realMessageIdHeader,
      in_reply_to: inReplyTo || null,
      from_email: account.email,
      to_emails: [emailLink.contact_email],
      cc_emails: [],
      subject: fullSubject,
      body_html: null,
      attachments: hasAttachments
        ? attachmentInputs.map((a) => ({
            name: a.fileName,
            size: a.fileSize,
            mimeType: a.mimeType,
          }))
        : null,
    };

    // Store in project_messages (use pre-generated ID for tracking pixel)
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("project_messages")
      .insert({
        id: messageDbId,
        project_id: thread.project_id,
        workspace_id: thread.workspace_id,
        sender_participant_id: participant?.id || null,
        sender_name: participant?.name || account.email,
        sender_role: null,
        content,
        source: "email",
        thread_id: threadId,
        email_metadata: emailMetadata,
        has_attachments: attachmentParts.length > 0,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[gmail-send] DB insert error:", insertError);
    }

    console.log(`[gmail-send] Email sent from ${account.email} to ${emailLink.contact_email}: "${fullSubject}"`);

    return new Response(
      JSON.stringify({
        success: true,
        messageId: inserted?.id,
        gmailMessageId: sendResult.id,
      }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[gmail-send] Error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to send email" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
