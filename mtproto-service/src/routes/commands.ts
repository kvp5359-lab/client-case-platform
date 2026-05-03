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
import { z } from "zod"
import { config } from "../config.js"
import { supabase } from "../db.js"
import { getClient } from "../sessions/manager.js"

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
        text: z.string().min(1),
        // Если это reply — telegram_message_id оригинального сообщения,
        // на которое отвечаем.
        reply_to_telegram_message_id: z.number().int().nullish(),
        // UUID нашего project_messages. Если передан — сервис сам стампит
        // telegram_message_id и telegram_chat_id после отправки. Используется
        // PG-триггером notify_telegram_on_new_message при автоотправке из UI.
        message_id_internal: z.string().uuid().optional(),
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
      const result = await client.sendMessage(peer, {
        message: body.data.text,
        parseMode: "html",
        replyTo: body.data.reply_to_telegram_message_id ?? undefined,
      })
      const telegramMessageId = Number(result.id)
      const telegramDate = result.date

      // Стампим в нашу БД, если был передан id внутреннего сообщения,
      // чтобы при ретраях (триггер шлёт повторно) мы видели «уже ушло»
      // и могли строить корректные ответы/реакции.
      if (body.data.message_id_internal) {
        await supabase
          .from("project_messages")
          .update({
            telegram_message_id: telegramMessageId,
            telegram_message_ids: [telegramMessageId],
            telegram_chat_id: body.data.client_tg_user_id,
            telegram_message_date: telegramDate
              ? new Date(telegramDate * 1000).toISOString()
              : null,
            telegram_error_detail: null,
          })
          .eq("id", body.data.message_id_internal)
      }

      return {
        ok: true,
        telegram_message_id: telegramMessageId,
        telegram_date: telegramDate,
      }
    } catch (err) {
      app.log.error({ err }, "messages/send failed")
      // Если был internal-id — стампим ошибку, чтобы UI мог показать «не доставлено».
      if (body.data.message_id_internal) {
        await supabase
          .from("project_messages")
          .update({ telegram_error_detail: humanError(err) })
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
        text: body.data.text,
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
