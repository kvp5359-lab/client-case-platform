/**
 * R2-ветка файлового слоя для Edge Functions (Deno).
 *
 * В edge есть секретные R2-ключи (env), поэтому здесь ходим в R2 напрямую по
 * S3-протоколу (aws4fetch), без посредника. Формы возврата совпадают с
 * `_shared/storage.ts` (`{ data, error }`), чтобы ветвление было прозрачным.
 *
 * Флаг переезда — env `STORAGE_R2_BUCKETS` (список бакетов через запятую,
 * `*` = все). Пусто → всё на Supabase.
 */

import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT") ?? "";
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID") ?? "";
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "";
/** Публичные домены R2 по бакетам: env `R2_PUBLIC_BASE` = `bucket=url,bucket=url`. */
const R2_PUBLIC_BASES: Record<string, string> = Object.fromEntries(
  (Deno.env.get("R2_PUBLIC_BASE") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.includes("="))
    .map((pair) => {
      const i = pair.indexOf("=");
      return [pair.slice(0, i).trim(), pair.slice(i + 1).trim().replace(/\/+$/, "")];
    }),
);

/**
 * true → бакет обслуживается R2. Флаг читается из env НА КАЖДЫЙ вызов —
 * чтобы смена секрета `STORAGE_R2_BUCKETS` переключала/откатывала мгновенно,
 * без ожидания рециклинга изолятов.
 */
export function isBucketOnR2(bucket: string): boolean {
  const raw = (Deno.env.get("STORAGE_R2_BUCKETS") ?? "").trim();
  if (!raw) return false;
  const set = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  return set.has("*") || set.has(bucket);
}

let _client: AwsClient | null = null;
function client(): AwsClient {
  if (!_client) {
    _client = new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: "auto",
    });
  }
  return _client;
}

function objectUrl(bucket: string, path: string): string {
  const key = path.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  return `${R2_ENDPOINT}/${bucket}/${key}`;
}

type Res<T> = { data: T | null; error: { message: string } | null };

export async function r2Upload(
  bucket: string,
  path: string,
  data: ArrayBuffer | Blob | Uint8Array | ReadableStream,
  options?: { contentType?: string },
): Promise<Res<{ path: string }>> {
  const res = await client().fetch(objectUrl(bucket, path), {
    method: "PUT",
    headers: { "Content-Type": options?.contentType ?? "application/octet-stream" },
    body: data as BodyInit,
  });
  if (!res.ok) return { data: null, error: { message: `R2 PUT ${res.status}` } };
  return { data: { path }, error: null };
}

export async function r2Download(bucket: string, path: string): Promise<Res<Blob>> {
  const res = await client().fetch(objectUrl(bucket, path), { method: "GET" });
  if (!res.ok) return { data: null, error: { message: `R2 GET ${res.status}` } };
  return { data: await res.blob(), error: null };
}

export async function r2CreateSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number,
): Promise<Res<{ signedUrl: string }>> {
  const url = new URL(objectUrl(bucket, path));
  url.searchParams.set("X-Amz-Expires", String(Math.min(Math.max(expiresIn, 60), 604800)));
  const signed = await client().sign(new Request(url.toString(), { method: "GET" }), {
    aws: { signQuery: true },
  });
  return { data: { signedUrl: signed.url }, error: null };
}

/** Публичная ссылка — домен бакета из R2_PUBLIC_BASES. Синхронно. */
export function r2GetPublicUrl(bucket: string, path: string): { data: { publicUrl: string } } {
  const key = path.replace(/^\/+/, "");
  return { data: { publicUrl: `${R2_PUBLIC_BASES[bucket] ?? ""}/${key}` } };
}

export async function r2Remove(bucket: string, paths: string[]): Promise<Res<unknown>> {
  for (const p of paths) {
    const res = await client().fetch(objectUrl(bucket, p), { method: "DELETE" });
    if (!res.ok && res.status !== 404) return { data: null, error: { message: `R2 DELETE ${res.status}` } };
  }
  return { data: {}, error: null };
}

export async function r2List(bucket: string, prefix?: string): Promise<Res<{ name: string }[]>> {
  const url = new URL(`${R2_ENDPOINT}/${bucket}`);
  url.searchParams.set("list-type", "2");
  if (prefix) url.searchParams.set("prefix", prefix.replace(/^\/+/, ""));
  const res = await client().fetch(url.toString(), { method: "GET" });
  if (!res.ok) return { data: null, error: { message: `R2 LIST ${res.status}` } };
  const xml = await res.text();
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => ({ name: m[1] }));
  return { data: keys, error: null };
}
