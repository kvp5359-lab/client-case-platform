/**
 * Чистые/переиспользуемые хелперы команд MTProto-сервиса, вынесены из
 * routes/commands.ts (распил файла-свалки, 2026-07-12). Логика не менялась —
 * только перенос: throttle backfill, mime-класс фото, подготовка Telegram-HTML,
 * резолв peer, скачивание вложений, разбор ошибок Telegram.
 */

import type { FastifyReply } from "fastify"
import bigInt from "big-integer"
import { Api, TelegramClient } from "telegram"
import { storageDownload } from "../storage.js"
import { supabase } from "../db.js"
import { htmlToTelegramHtml, isHtmlContent, escapeHtmlEntities } from "../utils/htmlFormatting.js"


/**
 * Per-session token bucket для backfill — ограничивает темп `getHistory`
 * запросов, чтобы не выловить FLOOD_WAIT и не светить «нечеловеческий»
 * паттерн перед антифродом. 1 запрос / 2 секунды × сессия.
 * Map чистится при graceful shutdown через тот же disconnectAll
 * (мы просто оставляем устаревшие записи — Map небольшая).
 */
const backfillLastCall = new Map<string, number>()
const BACKFILL_MIN_INTERVAL_MS = 2000

export async function throttleBackfill(userId: string): Promise<void> {
  const last = backfillLastCall.get(userId) ?? 0
  const wait = BACKFILL_MIN_INTERVAL_MS - (Date.now() - last)
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait))
  }
  backfillLastCall.set(userId, Date.now())
}

// Telegram sendPhoto / album-photo принимает только эти форматы. Остальное
// (tiff, heic, bmp, svg, ...) уходит как документ. Зеркалит логику в
// supabase/functions/telegram-send-message/index.ts.
const TELEGRAM_PHOTO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
])

export function isTelegramPhotoMime(mime: string | null | undefined): boolean {
  return typeof mime === "string" && TELEGRAM_PHOTO_MIME_TYPES.has(mime.toLowerCase())
}

// Фронт в split-варианте (текст + 2+ файла) пишет вторую запись с
// placeholder-content "📎" — он трактуется как «вложения без caption».
// БД не принимает пустой content (CHECK), поэтому такой сентинел нужен.
const ATTACHMENTS_ONLY_PLACEHOLDER = "\u{1F4CE}"

/** Превращает tiptap-HTML в Telegram-HTML. Plain text оставляем как есть,
 *  только эскейпим спецсимволы (иначе parseMode=html уронит парсер на &/<).
 *  Placeholder "📎" → пустая строка. */
export function prepareTelegramText(raw: string): string {
  if (!raw) return ""
  if (raw === ATTACHMENTS_ONLY_PLACEHOLDER) return ""
  return isHtmlContent(raw) ? htmlToTelegramHtml(raw) : escapeHtmlEntities(raw)
}

/**
 * Резолв peer-а клиента через gramjs.
 *
 * gramjs `getInputEntity(numericId)` иногда не находит peer в кеше — кеш
 * заполняется через `getEntity()` или Api.PeerUser-объекты из апдейтов.
 * Поэтому мы:
 *  1) Пробуем сразу через PeerUser с BigInt — это путь, по которому Telegram
 *     присылает peer в апдейтах, gramjs его кеширует.
 *  2) Fallback на client.getEntity(BigInt) — если в кеше нет, gramjs может
 *     сделать ResolveUsername или иной поиск. Для чистого user_id без username
 *     это сработает только если access_hash уже известен.
 *
 * Если оба способа не дают peer — кидаем понятную ошибку. Решение в этом
 * случае — попросить клиента написать что-нибудь сотруднику; новый апдейт
 * принесёт access_hash и сессия его закеширует.
 */
export async function resolvePeer(
  client: TelegramClient,
  clientTgUserId: number,
): Promise<Api.TypeInputPeer> {
  const peerUser = new Api.PeerUser({ userId: bigInt(clientTgUserId) })
  try {
    return await client.getInputEntity(peerUser)
  } catch (_) {
    // Иногда InputEntity по чистому Peer не находится — пробуем через Entity.
    const entity = await client.getEntity(peerUser)
    return await client.getInputEntity(entity)
  }
}

/**
 * Качает все вложения нашего сообщения из Supabase Storage. Возвращает
 * Buffer + имя файла для каждого. Большие файлы — память; ограничение
 * файла Telegram'а ~2GB, реалистично нам прилетят PDF/картинки/доки в
 * пределах десятков MB. Этого достаточно.
 */
export async function fetchAttachments(messageId: string): Promise<
  { buffer: Buffer; fileName: string; mimeType: string | null; attachmentId: string }[]
> {
  // Гонка: PG-триггер срабатывает на INSERT в project_messages мгновенно,
  // а фронт заливает вложения в message_attachments отдельными запросами
  // (после загрузки в Storage), причём не атомарно — несколько файлов могут
  // появляться поочередно. Ждём пока количество стабилизируется: после
  // первого появления продолжаем опрашивать, и выходим только когда два
  // подряд опроса дали одинаковое количество. Жёсткий потолок — 8 попыток
  // (~5.6с) чтобы не висеть бесконечно при поломке.
  let rows: Array<{ id: string; file_name: string; mime_type: string | null; storage_path: string; file_id: string | null }> = []
  let prevCount = -1
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data } = await supabase
      .from("message_attachments")
      .select("id, file_name, mime_type, storage_path, file_id")
      .eq("message_id", messageId)
    const cur = data?.length ?? 0
    if (cur > 0 && cur === prevCount) {
      rows = data as typeof rows
      break
    }
    prevCount = cur
    await new Promise((r) => setTimeout(r, 700))
  }
  if (rows.length === 0) return []

  const result: { buffer: Buffer; fileName: string; mimeType: string | null; attachmentId: string }[] = []
  for (const row of rows) {
    let bucket = "message-attachments"
    let path = row.storage_path as string
    // Если есть file_id — bucket/path могут быть в таблице files (для
    // переиспользуемых вложений из библиотеки). Совместимость с тем, как
    // делает telegram-send-message.
    if (row.file_id) {
      const { data: fileRow } = await supabase
        .from("files")
        .select("bucket, storage_path")
        .eq("id", row.file_id)
        .maybeSingle()
      if (fileRow) {
        bucket = fileRow.bucket as string
        path = fileRow.storage_path as string
      }
    }

    const { data: blob, error } = await storageDownload(bucket, path)
    if (error || !blob) {
      throw new Error(`Не удалось скачать вложение "${row.file_name}": ${error?.message ?? "no data"}`)
    }
    const arrayBuf = await blob.arrayBuffer()
    result.push({
      buffer: Buffer.from(arrayBuf),
      fileName: row.file_name as string,
      mimeType: (row.mime_type as string) ?? null,
      attachmentId: row.id as string,
    })
  }
  return result
}

export function humanError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message
    if (msg.includes("FLOOD_WAIT")) return "Telegram временно ограничивает запросы. Попробуйте позже."
    if (msg.includes("PEER_ID_INVALID")) return "Не удалось найти получателя в Telegram."
    if (msg.includes("MESSAGE_ID_INVALID")) return "Сообщение не найдено в Telegram."
    if (msg.includes("MESSAGE_NOT_MODIFIED")) return "Текст не изменился."
    if (msg.includes("REACTION_INVALID")) return "Telegram не разрешает эту реакцию для этого чата."
    return msg
  }
  return "Unknown error"
}

/**
 * Единый разбор ошибки Telegram в HTTP-ответ (B6).
 *   - FLOOD_WAIT_N → 429 + Retry-After (информативно для вызывающего, чтобы
 *     знал паузу). И send-путь, и фронт-вызовы (react/edit/read) одинаково.
 *   - всё остальное → 500 + humanError.
 * Раньше 429 умел только backfill-цикл, остальные роуты отдавали 500 и
 * теряли подсказку Retry-After. Оба кода — non-2xx, так что watchdog
 * dispatch'а по-прежнему помечает исходящее failed (политика без авторетрая
 * не меняется).
 */
export function floodAwareError(reply: FastifyReply, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  const flood = msg.match(/FLOOD_WAIT_(\d+)/)
  if (flood) {
    const seconds = Number(flood[1] ?? "60")
    return reply
      .code(429)
      .header("retry-after", String(seconds))
      .send({ error: "FLOOD_WAIT", retry_after_seconds: seconds })
  }
  return reply.code(500).send({ error: humanError(err) })
}
