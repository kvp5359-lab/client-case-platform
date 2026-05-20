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
import { ingestMtprotoMessage, fetchAndStoreAvatar } from "../handlers/incoming.js"
import { ensureClientParticipant } from "../handlers/inbox.js"

/**
 * Per-session token bucket для backfill — ограничивает темп `getHistory`
 * запросов, чтобы не выловить FLOOD_WAIT и не светить «нечеловеческий»
 * паттерн перед антифродом. 1 запрос / 2 секунды × сессия.
 * Map чистится при graceful shutdown через тот же disconnectAll
 * (мы просто оставляем устаревшие записи — Map небольшая).
 */
const backfillLastCall = new Map<string, number>()
const BACKFILL_MIN_INTERVAL_MS = 2000

async function throttleBackfill(userId: string): Promise<void> {
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

function isTelegramPhotoMime(mime: string | null | undefined): boolean {
  return typeof mime === "string" && TELEGRAM_PHOTO_MIME_TYPES.has(mime.toLowerCase())
}

// Фронт в split-варианте (текст + 2+ файла) пишет вторую запись с
// placeholder-content "📎" — он трактуется как «вложения без caption».
// БД не принимает пустой content (CHECK), поэтому такой сентинел нужен.
const ATTACHMENTS_ONLY_PLACEHOLDER = "\u{1F4CE}"

/** Превращает tiptap-HTML в Telegram-HTML. Plain text оставляем как есть,
 *  только эскейпим спецсимволы (иначе parseMode=html уронит парсер на &/<).
 *  Placeholder "📎" → пустая строка. */
function prepareTelegramText(raw: string): string {
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
          // Одиночный файл. Оборачиваем в CustomFile, чтобы gramjs увидел
          // имя/расширение — без этого Buffer летит как «unnamed» без типа.
          // Для поддерживаемых фото-mime ставим forceDocument=false → Telegram
          // отрисует inline-картинку, а не иконку файла.
          const f = files[0]!
          const isPhoto = isTelegramPhotoMime(f.mimeType)
          const customFile = new CustomFile(f.fileName, f.buffer.length, "", f.buffer)
          const sent = await client.sendFile(peer, {
            file: customFile,
            caption,
            parseMode: caption ? "html" : undefined,
            forceDocument: !isPhoto,
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

      // Fire-and-forget: пробуем подтянуть аватарку собеседника. Если это
      // первое сообщение из веба клиенту, который ещё не присылал нам
      // ничего, его participant либо отсутствует, либо без avatar_url.
      // ensureClientParticipant идемпотентен по telegram_user_id.
      void (async () => {
        try {
          const { data: session } = await supabase
            .from("mtproto_sessions")
            .select("workspace_id")
            .eq("user_id", body.data.user_id)
            .maybeSingle()
          if (!session?.workspace_id) return

          const peerUser = new Api.PeerUser({ userId: bigInt(body.data.client_tg_user_id) })

          let firstName: string | null = null
          let lastName: string | null = null
          try {
            const entity = await client.getEntity(peerUser)
            if (entity instanceof Api.User) {
              firstName = entity.firstName ?? null
              lastName = entity.lastName ?? null
            }
          } catch {
            /* peer не зарезолвился — participant может уже существовать, пробуем upsert */
          }

          const participantId = await ensureClientParticipant({
            workspace_id: session.workspace_id as string,
            telegram_user_id: body.data.client_tg_user_id,
            first_name: firstName,
            last_name: lastName,
          })
          if (!participantId) return

          await fetchAndStoreAvatar(client, {
            participantId,
            clientTgUserId: body.data.client_tg_user_id,
            peerUser,
          })
        } catch (err) {
          app.log.warn({ err }, "post-send avatar fetch failed")
        }
      })()

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

  // ------------------------------------------------------------------
  // POST /users/fetch-avatar
  // ------------------------------------------------------------------
  // Качает profile photo клиента через gramjs и сохраняет URL в
  // participants.avatar_url. Bot API не работает для MTProto-юзеров;
  // только клиентский MTProto может достать фото. Идемпотентно: если у
  // participant'а уже есть avatar_url — пропускаем (force=true перепишет).
  app.post("/users/fetch-avatar", async (req, reply) => {
    const body = z
      .object({
        user_id: z.string().uuid(),
        workspace_id: z.string().uuid(),
        client_tg_user_id: z.number().int(),
        force: z.boolean().optional().default(false),
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
      // 1. Резолвим participant'а — без него некуда писать avatar_url.
      const { data: participant } = await supabase
        .from("participants")
        .select("id, avatar_url")
        .eq("workspace_id", body.data.workspace_id)
        .eq("telegram_user_id", body.data.client_tg_user_id)
        .eq("is_deleted", false)
        .maybeSingle()
      if (!participant) {
        return reply.code(404).send({ error: "Participant not found" })
      }
      if (participant.avatar_url && !body.data.force) {
        return { ok: true, cached: true, avatar_url: participant.avatar_url }
      }

      // 2. Получаем entity клиента (с photo внутри).
      const peerUser = new Api.PeerUser({ userId: bigInt(body.data.client_tg_user_id) })
      const entity = await client.getEntity(peerUser)
      const hasPhoto = entity && "photo" in entity &&
        entity.photo && entity.photo.className !== "UserProfilePhotoEmpty"
      if (!hasPhoto) {
        return { ok: true, avatar_url: null, no_photo: true }
      }

      // 3. Скачиваем фото (большой размер).
      const buffer = await client.downloadProfilePhoto(entity, { isBig: true })
      if (!buffer || (buffer as Buffer).length === 0) {
        return { ok: true, avatar_url: null, no_photo: true }
      }

      // 4. Заливаем в Supabase Storage.
      const path = `tg/${body.data.client_tg_user_id}.jpg`
      const { error: uploadErr } = await supabase.storage
        .from("participant-avatars")
        .upload(path, buffer as Buffer, {
          contentType: "image/jpeg",
          upsert: true,
        })
      if (uploadErr) {
        return reply.code(500).send({ error: "Storage upload failed", detail: uploadErr.message })
      }

      const { data: pub } = supabase.storage
        .from("participant-avatars")
        .getPublicUrl(path)
      const avatarUrl = `${pub.publicUrl}?v=${Date.now()}`

      // 5. Апдейтим participants.avatar_url.
      await supabase
        .from("participants")
        .update({ avatar_url: avatarUrl })
        .eq("id", participant.id)

      return { ok: true, avatar_url: avatarUrl }
    } catch (err) {
      app.log.error({ err }, "users/fetch-avatar failed")
      return reply.code(500).send({ error: humanError(err) })
    }
  })

  // ------------------------------------------------------------------
  // POST /messages/backfill
  // ------------------------------------------------------------------
  // Догружает старые сообщения треда через `Api.messages.GetHistory`.
  // Используется фронтом для подгрузки истории при скролле вверх в треде:
  // после того как клиент исчерпал имеющиеся в БД сообщения, нажимает
  // кнопку «Загрузить ещё 50 из Telegram» — фронт зовёт этот эндпоинт.
  //
  // Идемпотентно: повторный вызов с тем же offset_id и limit вставит 0
  // новых строк (UNIQUE (thread_id, telegram_message_id, source) отобьёт
  // дубли через 23505 в ingestMtprotoMessage).
  //
  // Безопасность от FLOOD_WAIT:
  //   - per-session throttle (2 сек между вызовами),
  //   - limit зажат до 1..100,
  //   - на FLOOD_WAIT exception возвращаем 429 с Retry-After.
  app.post("/messages/backfill", async (req, reply) => {
    const body = z
      .object({
        thread_id: z.string().uuid(),
      })
      .safeParse(req.body)
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid body", details: body.error.issues })
    }

    // 1. Достаём тред — нужны session_user_id, peer_tg_user_id, workspace_id.
    const { data: thread } = await supabase
      .from("project_threads")
      .select("id, workspace_id, mtproto_session_user_id, mtproto_client_tg_user_id")
      .eq("id", body.data.thread_id)
      .maybeSingle()
    if (
      !thread ||
      !thread.mtproto_session_user_id ||
      !thread.mtproto_client_tg_user_id
    ) {
      return reply.code(400).send({ error: "Not a MTProto thread" })
    }

    const sessionUserId = thread.mtproto_session_user_id as string
    const clientTgUserId = Number(thread.mtproto_client_tg_user_id)

    const client = getClient(sessionUserId)
    if (!client) {
      return reply.code(409).send({ error: "Session not connected" })
    }

    // 2. Курсор: самый старый telegram_message_id в этом треде.
    //    offsetId=0 в gramjs значит «с самого свежего» — тогда возьмём
    //    последние limit штук. Это случай «пустой тред».
    const { data: oldest } = await supabase
      .from("project_messages")
      .select("telegram_message_id")
      .eq("thread_id", thread.id)
      .eq("source", "telegram_mtproto")
      .not("telegram_message_id", "is", null)
      .order("telegram_message_id", { ascending: true })
      .limit(1)
      .maybeSingle()
    const offsetId = oldest?.telegram_message_id
      ? Number(oldest.telegram_message_id)
      : 0
    const limit = 50

    // 3. Throttle перед запросом.
    await throttleBackfill(sessionUserId)

    // 4. Резолв peer — используем тот же путь, что в /messages/send.
    let peer: Api.TypeInputPeer
    try {
      peer = await resolvePeer(client, clientTgUserId)
    } catch (err) {
      app.log.error({ err }, "backfill resolvePeer failed")
      return reply.code(500).send({ error: humanError(err) })
    }

    // 5. GetHistory: offset_id — exclusive (Telegram отдаёт сообщения
    //    СТАРШЕ offsetId). Это ровно то, что нам нужно для «листать вверх».
    let messagesArr: Api.Message[]
    try {
      const res = await client.invoke(
        new Api.messages.GetHistory({
          peer,
          offsetId,
          offsetDate: 0,
          addOffset: 0,
          limit,
          maxId: 0,
          minId: 0,
          hash: bigInt(0),
        }),
      )
      // GetHistory возвращает Messages | MessagesSlice | ChannelMessages
      // или MessagesNotModified. Берём поле messages из всего, кроме
      // NotModified (которого тут быть не может — мы не передаём hash).
      const raw = (res as unknown as { messages?: Api.TypeMessage[] }).messages ?? []
      // Фильтруем служебные (MessageService, MessageEmpty) — нас интересуют
      // только реальные пользовательские сообщения.
      messagesArr = raw.filter(
        (m): m is Api.Message => m instanceof Api.Message,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const flood = msg.match(/FLOOD_WAIT_(\d+)/)
      if (flood) {
        const seconds = Number(flood[1] ?? "60")
        return reply
          .code(429)
          .header("retry-after", String(seconds))
          .send({ error: "FLOOD_WAIT", retry_after_seconds: seconds })
      }
      app.log.error({ err }, "messages/backfill GetHistory failed")
      return reply.code(500).send({ error: humanError(err) })
    }

    // 6. Ingest каждое сообщение через общую функцию. Сортируем по id ASC,
    //    чтобы reply-цепочки резолвились корректно (оригинал вставится
    //    раньше реплая → reply_to_message_id найдётся).
    messagesArr.sort((a, b) => Number(a.id) - Number(b.id))

    const peerUser = new Api.PeerUser({ userId: bigInt(clientTgUserId) })
    const ctx = {
      user_id: sessionUserId,
      workspace_id: thread.workspace_id as string,
      // tg_user_id — это id СОТРУДНИКА. Достаём из сессии.
      tg_user_id: 0, // заполним ниже
    }
    const { data: session } = await supabase
      .from("telegram_mtproto_sessions")
      .select("tg_user_id")
      .eq("user_id", sessionUserId)
      .maybeSingle()
    if (session?.tg_user_id) {
      ctx.tg_user_id = Number(session.tg_user_id)
    }

    let inserted = 0
    for (const msg of messagesArr) {
      try {
        const r = await ingestMtprotoMessage({
          ctx,
          client,
          msg,
          peerUser,
          backfill: true,
        })
        if (r.inserted) inserted++
      } catch (err) {
        app.log.warn({ err, telegram_message_id: Number(msg.id) }, "backfill ingest failed")
      }
    }

    // has_more = true если Telegram вернул полный батч; если меньше limit —
    // значит мы добрались до начала истории.
    const hasMore = messagesArr.length >= limit

    return {
      ok: true,
      fetched: messagesArr.length,
      inserted,
      has_more: hasMore,
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
