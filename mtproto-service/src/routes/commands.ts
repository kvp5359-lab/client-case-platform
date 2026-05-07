/**
 * HTTP-эндпоинты для команд от Edge Functions / pg-триггера:
 * отправка сообщений, реакции, прочитанность, редактирование, удаление.
 *
 * Каждая команда:
 *  1. Достаёт активный TelegramClient сотрудника из sessions manager.
 *     Если клиента нет (сессия не подключена / упала) → 409.
 *  2. Резолвит peer клиента по tg_user_id через gramjs internal cache
 *     (cache живёт в StringSession и восстанавливается при bootstrap).
 *  3. Вызывает соответствующий MTProto-метод.
 *  4. Возвращает результат, в т.ч. telegram_message_id для записи в БД.
 */

import type { FastifyPluginAsync } from "fastify"
import bigInt from "big-integer"
import { Api, TelegramClient } from "telegram"
import { CustomFile } from "telegram/client/uploads.js"
import { z } from "zod"
import { config } from "../config.js"
import { supabase } from "../db.js"
import { getClient } from "../sessions/manager.js"
import { htmlToTelegramHtml, isHtmlContent, escapeHtmlEntities } from "../utils/htmlFormatting.js"

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

function isTelegramPhotoMime(mime: string | null | undefined): boolean {
  return typeof mime === "string" && TELEGRAM_PHOTO_MIME_TYPES.has(mime.toLowerCase())
}

/** Превращает tiptap-HTML в Telegram-HTML. Plain text оставляем как есть,
 *  только эскейпим спецсимволы (иначе parseMode=html уронит парсер на &/<). */
function prepareTelegramText(raw: string): string {
  if (!raw) return ""
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
async function resolvePeer(
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

export const commandsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req, reply) => {
    const got = req.headers["x-internal-secret"]
    if (got !== config.INTERNAL_SECRET) {
      return reply.code(401).send({ error: "Unauthorized" })
    }
  })

  // ------------------------------------------------------------------
  // POST /messages/send
  // ------------------------------------------------------------------
  app.post("/messages/send", async (req, reply) => {
    const body = z
      .object({
        user_id: z.string().uuid(),
        client_tg_user_id: z.number().int(),
        // text может быть пустой, если только вложения. Валидация ниже:
        // должен быть либо непустой text, либо has_attachments=true.
        text: z.string(),
        reply_to_telegram_message_id: z.number().int().nullish(),
        message_id_internal: z.string().uuid().optional(),
        has_attachments: z.boolean().optional().default(false),
      })
      .safeParse(req.body)
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid body", details: body.error.issues })
    }
    if (!body.data.has_attachments && body.data.text.length === 0) {
      return reply.code(400).send({ error: "Either text or has_attachments must be set" })
    }

    const client = getClient(body.data.user_id)
    if (!client) {
      return reply.code(409).send({ error: "Session not connected" })
    }

    try {
      const peer = await resolvePeer(client, body.data.client_tg_user_id)
      const sentIds: number[] = []
      let firstDate: number | undefined

      if (body.data.has_attachments && body.data.message_id_internal) {
        const files = await fetchAttachments(body.data.message_id_internal)
        if (files.length === 0) {
          throw new Error("Не удалось отправить ни одного файла.")
        }
        const captionText = prepareTelegramText(body.data.text)
        const caption = captionText.length > 0 ? captionText : undefined

        if (files.length === 1) {
          // Одиночный файл. Если это поддерживаемое фото — отправляем БЕЗ
          // DocumentAttributeFilename и с forceDocument=false, чтобы Telegram
          // показал inline-картинку, а не «иконку файла». Прочее — документом.
          const f = files[0]!
          const isPhoto = isTelegramPhotoMime(f.mimeType)
          const sent = await client.sendFile(peer, {
            file: f.buffer,
            caption,
            parseMode: caption ? "html" : undefined,
            forceDocument: !isPhoto,
            attributes: isPhoto
              ? undefined
              : [new Api.DocumentAttributeFilename({ fileName: f.fileName })],
            replyTo: body.data.reply_to_telegram_message_id ?? undefined,
          })
          if (sent && "id" in sent) {
            sentIds.push(Number((sent as { id: number | bigint }).id))
            firstDate = (sent as { date?: number }).date
          }
        } else {
          // Несколько файлов — альбом (groupedId), TG показывает как одну
          // карточку. CustomFile несёт имя файла; для фото это не мешает —
          // gramjs в album-режиме определяет тип по расширению / mime.
          const customFiles = files.map(
            (f) => new CustomFile(f.fileName, f.buffer.length, "", f.buffer),
          )
          const allPhotos = files.every((f) => isTelegramPhotoMime(f.mimeType))
          const sentList = await client.sendFile(peer, {
            file: customFiles,
            caption,
            parseMode: caption ? "html" : undefined,
            forceDocument: !allPhotos,
            replyTo: body.data.reply_to_telegram_message_id ?? undefined,
          }) as unknown as Api.Message | Api.Message[]
          const arr = Array.isArray(sentList) ? sentList : [sentList]
          for (const m of arr) {
            if (m && "id" in m) {
              sentIds.push(Number((m as { id: number | bigint }).id))
              if (firstDate === undefined) {
                firstDate = (m as { date?: number }).date
              }
            }
          }
        }

        if (sentIds.length === 0) {
          throw new Error("Не удалось отправить ни одного файла.")
        }
      } else {
        const result = await client.sendMessage(peer, {
          message: prepareTelegramText(body.data.text),
          parseMode: "html",
          replyTo: body.data.reply_to_telegram_message_id ?? undefined,
        })
        sentIds.push(Number(result.id))
        firstDate = result.date
      }

      const telegramMessageId = sentIds[0]

      if (body.data.message_id_internal) {
        await supabase
          .from("project_messages")
          .update({
            telegram_message_id: telegramMessageId,
            telegram_message_ids: sentIds,
            telegram_chat_id: body.data.client_tg_user_id,
            telegram_message_date: firstDate
              ? new Date(firstDate * 1000).toISOString()
              : null,
            telegram_attachments_delivered: body.data.has_attachments ? true : null,
            telegram_error_detail: null,
          })
          .eq("id", body.data.message_id_internal)
      }

      return {
        ok: true,
        telegram_message_id: telegramMessageId,
        telegram_message_ids: sentIds,
        telegram_date: firstDate,
      }
    } catch (err) {
      app.log.error({ err }, "messages/send failed")
      if (body.data.message_id_internal) {
        await supabase
          .from("project_messages")
          .update({
            telegram_error_detail: humanError(err),
            telegram_attachments_delivered: body.data.has_attachments ? false : null,
          })
          .eq("id", body.data.message_id_internal)
      }
      return reply.code(500).send({ error: humanError(err) })
    }
  })

  // ------------------------------------------------------------------
  // POST /messages/edit
  // ------------------------------------------------------------------
  app.post("/messages/edit", async (req, reply) => {
    const body = z
      .object({
        user_id: z.string().uuid(),
        client_tg_user_id: z.number().int(),
        telegram_message_id: z.number().int(),
        text: z.string().min(1),
      })
      .safeParse(req.body)
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid body", details: body.error.issues })
    }

    const client = getClient(body.data.user_id)
    if (!client) {
      return reply.code(409).send({ error: "Session not connected" })
    }

    try {
      const peer = await resolvePeer(client, body.data.client_tg_user_id)
      await client.editMessage(peer, {
        message: body.data.telegram_message_id,
        text: prepareTelegramText(body.data.text),
        parseMode: "html",
      })
      return { ok: true }
    } catch (err) {
      app.log.error({ err }, "messages/edit failed")
      return reply.code(500).send({ error: humanError(err) })
    }
  })

  // ------------------------------------------------------------------
  // POST /messages/delete
  // ------------------------------------------------------------------
  app.post("/messages/delete", async (req, reply) => {
    const body = z
      .object({
        user_id: z.string().uuid(),
        client_tg_user_id: z.number().int(),
        telegram_message_ids: z.array(z.number().int()).min(1),
        // Удалить и у получателя? По умолчанию да — чтобы UX совпадал с тем,
        // что юзер ждёт от своего Telegram.
        revoke: z.boolean().default(true),
      })
      .safeParse(req.body)
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid body", details: body.error.issues })
    }

    const client = getClient(body.data.user_id)
    if (!client) {
      return reply.code(409).send({ error: "Session not connected" })
    }

    try {
      const peer = await resolvePeer(client, body.data.client_tg_user_id)
      await client.deleteMessages(peer, body.data.telegram_message_ids, {
        revoke: body.data.revoke,
      })
      return { ok: true }
    } catch (err) {
      app.log.error({ err }, "messages/delete failed")
      return reply.code(500).send({ error: humanError(err) })
    }
  })

  // ------------------------------------------------------------------
  // POST /reactions/set
  // ------------------------------------------------------------------
  // emoji=null означает «снять реакцию».
  // Это ровно тот метод, ради которого затеян MTProto-канал —
  // setMessageReaction в Bot API не работает для Business.
  app.post("/reactions/set", async (req, reply) => {
    const body = z
      .object({
        user_id: z.string().uuid(),
        client_tg_user_id: z.number().int(),
        telegram_message_id: z.number().int(),
        emoji: z.string().nullable(),
      })
      .safeParse(req.body)
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid body", details: body.error.issues })
    }

    const client = getClient(body.data.user_id)
    if (!client) {
      return reply.code(409).send({ error: "Session not connected" })
    }

    try {
      const peer = await resolvePeer(client, body.data.client_tg_user_id)
      const reaction = body.data.emoji
        ? [new Api.ReactionEmoji({ emoticon: body.data.emoji })]
        : []
      await client.invoke(
        new Api.messages.SendReaction({
          peer,
          msgId: body.data.telegram_message_id,
          reaction,
          // big=false — обычная реакция, не анимированная во весь экран.
          big: false,
          addToRecent: true,
        }),
      )
      return { ok: true }
    } catch (err) {
      app.log.error({ err }, "reactions/set failed")
      return reply.code(500).send({ error: humanError(err) })
    }
  })

  // ------------------------------------------------------------------
  // POST /threads/read
  // ------------------------------------------------------------------
  // Отметить все входящие в чате до указанного message_id как прочитанные.
  // Вызывается с фронта, когда сотрудник открыл тред.
  app.post("/threads/read", async (req, reply) => {
    const body = z
      .object({
        user_id: z.string().uuid(),
        client_tg_user_id: z.number().int(),
        // До какого message_id отметить прочитанным (включительно).
        // Если не указано — Telegram отметит все непрочитанные.
        max_telegram_message_id: z.number().int().optional(),
      })
      .safeParse(req.body)
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid body", details: body.error.issues })
    }

    const client = getClient(body.data.user_id)
    if (!client) {
      return reply.code(409).send({ error: "Session not connected" })
    }

    try {
      const peer = await resolvePeer(client, body.data.client_tg_user_id)
      await client.markAsRead(
        peer,
        body.data.max_telegram_message_id,
      )
      return { ok: true }
    } catch (err) {
      app.log.error({ err }, "threads/read failed")
      return reply.code(500).send({ error: humanError(err) })
    }
  })
}

/**
 * Качает все вложения нашего сообщения из Supabase Storage. Возвращает
 * Buffer + имя файла для каждого. Большие файлы — память; ограничение
 * файла Telegram'а ~2GB, реалистично нам прилетят PDF/картинки/доки в
 * пределах десятков MB. Этого достаточно.
 */
async function fetchAttachments(messageId: string): Promise<
  { buffer: Buffer; fileName: string; mimeType: string | null }[]
> {
  // Гонка: PG-триггер срабатывает на INSERT в project_messages мгновенно,
  // а фронт заливает вложения в message_attachments отдельными запросами
  // (после загрузки в Storage), причём не атомарно — несколько файлов могут
  // появляться поочередно. Ждём пока количество стабилизируется: после
  // первого появления продолжаем опрашивать, и выходим только когда два
  // подряд опроса дали одинаковое количество. Жёсткий потолок — 8 попыток
  // (~5.6с) чтобы не висеть бесконечно при поломке.
  let rows: Array<{ file_name: string; mime_type: string | null; storage_path: string; file_id: string | null }> = []
  let prevCount = -1
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data } = await supabase
      .from("message_attachments")
      .select("file_name, mime_type, storage_path, file_id")
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

  const result: { buffer: Buffer; fileName: string; mimeType: string | null }[] = []
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

    const { data: blob, error } = await supabase.storage.from(bucket).download(path)
    if (error || !blob) {
      throw new Error(`Не удалось скачать вложение "${row.file_name}": ${error?.message ?? "no data"}`)
    }
    const arrayBuf = await blob.arrayBuffer()
    result.push({
      buffer: Buffer.from(arrayBuf),
      fileName: row.file_name as string,
      mimeType: (row.mime_type as string) ?? null,
    })
  }
  return result
}

function humanError(err: unknown): string {
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
