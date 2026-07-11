/**
 * Zero-dependency доступ к Cloudflare R2 (S3-совместимый) для СКРИПТОВ,
 * которые бегут в голом `node:22-alpine` без node_modules (ночной бэкап,
 * смок-матрица). Только встроенный `node:crypto` + глобальный `fetch`.
 *
 * Подпись — AWS Signature V4 (path-style, `UNSIGNED-PAYLOAD`). Крипто-цепочка
 * провалидирована против официального тест-вектора AWS (см. r2.test.mjs).
 *
 * Env:
 *   R2_ENDPOINT           — https://<acct>.r2.cloudflarestorage.com
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   STORAGE_R2_BUCKETS    — csv бакетов на R2 (или `*`); пусто → ничего
 */

import crypto from 'node:crypto'

const sha256hex = (data) => crypto.createHash('sha256').update(data).digest('hex')
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest()

/** RFC3986-кодирование одного значения. keepSlash=true — не кодировать `/` (для path). */
export function uriEncode(str, keepSlash = false) {
  let out = ''
  for (const byte of Buffer.from(String(str), 'utf8')) {
    const c = String.fromCharCode(byte)
    const unreserved =
      (byte >= 0x41 && byte <= 0x5a) || // A-Z
      (byte >= 0x61 && byte <= 0x7a) || // a-z
      (byte >= 0x30 && byte <= 0x39) || // 0-9
      c === '-' || c === '_' || c === '.' || c === '~'
    if (unreserved) out += c
    else if (c === '/' && keepSlash) out += '/'
    else out += '%' + byte.toString(16).toUpperCase().padStart(2, '0')
  }
  return out
}

/**
 * Подписать S3-запрос (SigV4) и вернуть заголовки. Экспортируется ради теста —
 * принимает все параметры явно, чтобы прогнать официальный вектор AWS.
 */
export function signV4({
  method,
  host,
  canonicalUri, // уже URI-кодированный путь, начинается с '/'
  query = {}, // { ключ: значение } — сырые, закодируем внутри
  headers = {}, // доп. подписываемые заголовки (напр. range), lowercase-ключи
  payloadHash = 'UNSIGNED-PAYLOAD',
  accessKeyId,
  secretAccessKey,
  region = 'auto',
  service = 's3',
  amzDate, // YYYYMMDDTHHMMSSZ — переопределяемо для теста
}) {
  const now = amzDate ?? new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
  const datestamp = now.slice(0, 8)

  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join('&')

  const allHeaders = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': now, ...headers }
  const sortedKeys = Object.keys(allHeaders).map((k) => k.toLowerCase()).sort()
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${String(allHeaders[k]).trim()}\n`).join('')
  const signedHeaders = sortedKeys.join(';')

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const scope = `${datestamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    now,
    scope,
    sha256hex(canonicalRequest),
  ].join('\n')

  const kDate = hmac(`AWS4${secretAccessKey}`, datestamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  return { authorization, amzDate: now, payloadHash, signature, signedHeaders, canonicalRequest, stringToSign }
}

// ── Конфиг из env ────────────────────────────────────────────────────────────
const ENDPOINT = (process.env.R2_ENDPOINT ?? '').replace(/\/+$/, '')
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? ''
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? ''
const rawFlag = (process.env.STORAGE_R2_BUCKETS ?? '').trim()
const r2Set = new Set(rawFlag.split(',').map((s) => s.trim()).filter(Boolean))

export function isBucketOnR2(bucket) {
  return r2Set.has('*') || r2Set.has(bucket)
}

export function r2Configured() {
  return Boolean(ENDPOINT && ACCESS_KEY_ID && SECRET_ACCESS_KEY)
}

function encodeKey(key) {
  return key.replace(/^\/+/, '').split('/').filter(Boolean).map((s) => uriEncode(s)).join('/')
}

/** Низкоуровневый подписанный запрос к R2. */
async function r2Request(method, bucket, key, { query = {}, body, contentType } = {}) {
  if (!r2Configured()) throw new Error('R2 env не задан (R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY)')
  const host = new URL(ENDPOINT).host
  const encodedKey = key ? encodeKey(key) : ''
  const canonicalUri = '/' + bucket + (encodedKey ? '/' + encodedKey : '')
  const { authorization, amzDate, payloadHash } = signV4({
    method,
    host,
    canonicalUri,
    query,
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  })
  const qs = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join('&')
  const urlStr = `${ENDPOINT}${canonicalUri}${qs ? `?${qs}` : ''}`
  const reqHeaders = {
    Authorization: authorization,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  }
  if (contentType) reqHeaders['Content-Type'] = contentType
  return fetch(urlStr, { method, headers: reqHeaders, body })
}

/**
 * Полный список объектов бакета (ListObjectsV2, с continuation-token).
 * → [{ key, size, etag, lastModified }]
 */
export async function r2List(bucket, prefix = '') {
  const out = []
  let token
  for (;;) {
    const query = { 'list-type': '2', 'max-keys': '1000' }
    if (prefix) query.prefix = prefix
    if (token) query['continuation-token'] = token
    const res = await r2Request('GET', bucket, '', { query })
    if (!res.ok) throw new Error(`R2 LIST ${bucket} → HTTP ${res.status}`)
    const xml = await res.text()
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const block = m[1]
      const key = decodeXml((block.match(/<Key>([\s\S]*?)<\/Key>/) ?? [])[1] ?? '')
      const size = Number((block.match(/<Size>(\d+)<\/Size>/) ?? [])[1] ?? 0)
      const etag = (block.match(/<ETag>([\s\S]*?)<\/ETag>/) ?? [])[1] ?? ''
      const lastModified = (block.match(/<LastModified>([\s\S]*?)<\/LastModified>/) ?? [])[1] ?? ''
      if (key) out.push({ key, size, etag, lastModified })
    }
    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml)
    token = (xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/) ?? [])[1]
    if (!truncated || !token) break
  }
  return out
}

/** Скачать объект → Buffer (или null при 404). */
export async function r2Get(bucket, key) {
  const res = await r2Request('GET', bucket, key)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`R2 GET ${bucket}/${key} → HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/** Залить объект. body — Buffer/Uint8Array. */
export async function r2Put(bucket, key, body, contentType = 'application/octet-stream') {
  const res = await r2Request('PUT', bucket, key, { body, contentType })
  if (!res.ok) throw new Error(`R2 PUT ${bucket}/${key} → HTTP ${res.status}`)
}

function decodeXml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
