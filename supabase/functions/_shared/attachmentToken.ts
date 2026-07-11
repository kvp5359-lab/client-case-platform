/**
 * Подписанный токен доступа к вложению для ВНЕШНИХ сервисов, которые сами
 * скачивают файл по ссылке (Wazzup: contentUri). R2 presigned-ссылку такие
 * сервисы иногда не могут забрать (много параметров подписи в query), поэтому
 * им отдаётся простая ссылка на `attachment-proxy/<token>` — токен в ПУТИ,
 * без чувствительных query-параметров.
 *
 * Токен = base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, payload)).
 * Подделать нельзя (HMAC на INTERNAL_FUNCTION_SECRET), живёт до `exp`.
 */

const SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function hmac(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return b64url(new Uint8Array(sig));
}

export interface AttachmentTokenPayload {
  /** storage_path в бакете files */
  p: string;
  /** content-type */
  ct?: string;
  /** имя файла */
  fn?: string;
  /** unix-время истечения (сек) */
  exp: number;
}

export async function signAttachmentToken(payload: AttachmentTokenPayload): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(body)}`;
}

export async function verifyAttachmentToken(token: string): Promise<AttachmentTokenPayload | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  if (token.slice(dot + 1) !== (await hmac(body))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))) as AttachmentTokenPayload;
    if (!payload.p || !payload.exp || Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
