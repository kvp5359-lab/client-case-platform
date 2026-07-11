/**
 * R2-ветка файлового слоя для mtproto-service (Node).
 *
 * У сервиса есть секретные R2-ключи (env), ходим в R2 напрямую по S3-протоколу
 * (aws4fetch, поверх глобального fetch Node 20+). Формы возврата совпадают с
 * `./storage.ts` (`{ data, error }`).
 *
 * Флаг переезда — env `STORAGE_R2_BUCKETS` (список через запятую, `*` = все).
 */

import { AwsClient } from "aws4fetch"

const R2_ENDPOINT = (process.env.R2_ENDPOINT ?? "").replace(/\/+$/, "")
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE ?? "").replace(/\/+$/, "")

const rawFlag = (process.env.STORAGE_R2_BUCKETS ?? "").trim()
const r2BucketSet = new Set(rawFlag.split(",").map((s) => s.trim()).filter(Boolean))
const allOnR2 = r2BucketSet.has("*")

export function isBucketOnR2(bucket: string): boolean {
  return allOnR2 || r2BucketSet.has(bucket)
}

const r2 = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  service: "s3",
  region: "auto",
})

function objectUrl(bucket: string, path: string): string {
  const key = path.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/")
  return `${R2_ENDPOINT}/${bucket}/${key}`
}

type Res<T> = { data: T | null; error: { message: string } | null }

export async function r2Upload(
  bucket: string,
  path: string,
  data: ArrayBuffer | Blob | Buffer | Uint8Array,
  options?: { contentType?: string },
): Promise<Res<{ path: string }>> {
  const res = await r2.fetch(objectUrl(bucket, path), {
    method: "PUT",
    headers: { "Content-Type": options?.contentType ?? "application/octet-stream" },
    // Node 20 fetch принимает Buffer/Uint8Array/Blob/ArrayBuffer; BodyInit в этом lib не объявлен.
    body: data as unknown as ArrayBuffer,
  })
  if (!res.ok) return { data: null, error: { message: `R2 PUT ${res.status}` } }
  return { data: { path }, error: null }
}

export async function r2Download(bucket: string, path: string): Promise<Res<Blob>> {
  const res = await r2.fetch(objectUrl(bucket, path), { method: "GET" })
  if (!res.ok) return { data: null, error: { message: `R2 GET ${res.status}` } }
  return { data: await res.blob(), error: null }
}

export function r2GetPublicUrl(bucket: string, path: string): { data: { publicUrl: string } } {
  const key = path.replace(/^\/+/, "")
  return { data: { publicUrl: `${R2_PUBLIC_BASE}/${bucket}/${key}` } }
}

export async function r2Remove(bucket: string, paths: string[]): Promise<Res<unknown>> {
  for (const p of paths) {
    const res = await r2.fetch(objectUrl(bucket, p), { method: "DELETE" })
    if (!res.ok && res.status !== 404) return { data: null, error: { message: `R2 DELETE ${res.status}` } }
  }
  return { data: {}, error: null }
}
