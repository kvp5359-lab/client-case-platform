/**
 * Форматирование исходящего письма: HTML/текст-хелперы + сборка RFC2822 для
 * Gmail API. Чистые функции (без сети/БД) — вынесены из index.ts (распил
 * 2026-07-12), поведение не менялось.
 */
import { uint8ArrayToBase64 } from "../_shared/encoding.ts";

export function wrapPlainAsHtmlIfNeeded(content: string): string {
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
export function wrapEmailHtml(body: string): string {
  // Прокидываем стили на blockquote в стиле Gmail (вертикальная серая полоска,
  // отступ слева). Tiptap отдаёт <blockquote><p>...</p></blockquote> без стилей.
  const styledBody = body.replace(
    /<blockquote(\s[^>]*)?>/gi,
    `<blockquote style="margin:0 0 0 0.8ex;border-left:1px solid #ccc;padding-left:1ex;color:#555">`,
  );
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">${styledBody}</body></html>`;
}

export function htmlToPlainText(html: string): string {
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
export function escapeFromName(name: string): string {
  return name.replace(/["\r\n]/g, " ").trim();
}

/**
 * Минимальный RFC2822 message с multipart/alternative (text + html)
 * для отправки через Gmail API users.messages.send.
 *
 * Subject и Имя кодируются в RFC2047 (UTF-8 base64) — иначе кириллица будет
 * битой в Gmail клиенте получателя.
 */
export function buildRfc2822(opts: {
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
