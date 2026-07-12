/**
 * HTTP-эндпоинты для auth flow.
 *
 * Все защищены заголовком `x-internal-secret`. Эндпоинты вызываются только
 * с фронта через нашу Edge Function-прокладку (там JWT юзера → проверка
 * прав → проксирование в этот сервис), не напрямую из браузера.
 */

import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { config } from "../config.js"
import { safeSecretEqual } from "../utils/secret.js"
import {
  sendCode,
  signInWithCode,
  signInWithPassword,
} from "../auth/flow.js"
import { disconnectAndRemove } from "../sessions/manager.js"
import { supabase } from "../db.js"

export const authRoutes: FastifyPluginAsync = async (app) => {
  // Pre-handler: проверка internal secret.
  app.addHook("preHandler", async (req, reply) => {
    if (!safeSecretEqual(req.headers["x-internal-secret"], config.INTERNAL_SECRET)) {
      return reply.code(401).send({ error: "Unauthorized" })
    }
  })

  app.post("/auth/send-code", async (req, reply) => {
    const body = z
      .object({
        user_id: z.string().uuid(),
        workspace_id: z.string().uuid(),
        phone: z
          .string()
          .regex(/^\+?[0-9]{6,18}$/, "phone must be in international format"),
      })
      .safeParse(req.body)
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid body", details: body.error.issues })
    }
    try {
      await sendCode({
        user_id: body.data.user_id,
        workspace_id: body.data.workspace_id,
        phone: body.data.phone.startsWith("+")
          ? body.data.phone
          : `+${body.data.phone}`,
      })
      return { ok: true }
    } catch (err) {
      app.log.error({ err }, "send-code failed")
      return reply.code(500).send({ error: humanError(err) })
    }
  })

  app.post("/auth/verify-code", async (req, reply) => {
    const body = z
      .object({
        user_id: z.string().uuid(),
        code: z.string().regex(/^\d{4,7}$/, "code must be 4-7 digits"),
      })
      .safeParse(req.body)
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid body", details: body.error.issues })
    }
    try {
      const result = await signInWithCode(body.data)
      return result
    } catch (err) {
      app.log.error({ err }, "verify-code failed")
      return reply.code(400).send({ error: humanError(err) })
    }
  })

  app.post("/auth/verify-password", async (req, reply) => {
    const body = z
      .object({
        user_id: z.string().uuid(),
        password: z.string().min(1),
      })
      .safeParse(req.body)
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid body", details: body.error.issues })
    }
    try {
      const result = await signInWithPassword(body.data)
      return result
    } catch (err) {
      app.log.error({ err }, "verify-password failed")
      return reply.code(400).send({ error: humanError(err) })
    }
  })

  app.post("/auth/disconnect", async (req, reply) => {
    const body = z
      .object({ user_id: z.string().uuid() })
      .safeParse(req.body)
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid body" })
    }
    try {
      await disconnectAndRemove(body.data.user_id)
      await supabase
        .from("telegram_mtproto_sessions")
        .update({
          is_active: false,
          disconnected_at: new Date().toISOString(),
        })
        .eq("user_id", body.data.user_id)
      return { ok: true }
    } catch (err) {
      app.log.error({ err }, "disconnect failed")
      return reply.code(500).send({ error: humanError(err) })
    }
  })

  app.get("/auth/status", async (req, reply) => {
    const query = z
      .object({ user_id: z.string().uuid() })
      .safeParse(req.query)
    if (!query.success) {
      return reply.code(400).send({ error: "Invalid query" })
    }
    const { data } = await supabase
      .from("telegram_mtproto_sessions")
      .select("user_id, tg_user_id, tg_username, tg_first_name, tg_last_name, is_active, last_seen_at")
      .eq("user_id", query.data.user_id)
      .maybeSingle()
    return { session: data }
  })
}

function humanError(err: unknown): string {
  if (err instanceof Error) {
    // Понятные сообщения для типичных ошибок Telegram API.
    const msg = err.message
    if (msg.includes("PHONE_NUMBER_INVALID")) return "Неверный формат номера телефона"
    if (msg.includes("PHONE_CODE_INVALID")) return "Неверный код подтверждения"
    if (msg.includes("PHONE_CODE_EXPIRED")) return "Код подтверждения истёк, запросите новый"
    if (msg.includes("PASSWORD_HASH_INVALID")) return "Неверный пароль 2FA"
    if (msg.includes("FLOOD_WAIT")) return "Слишком много попыток, попробуйте позже"
    if (msg.includes("PHONE_NUMBER_BANNED")) return "Этот номер заблокирован Telegram"
    return msg
  }
  return "Unknown error"
}
