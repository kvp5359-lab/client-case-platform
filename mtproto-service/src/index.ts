/**
 * Bootstrap MTProto-сервиса.
 *
 *  1. Поднимаем Fastify HTTP-сервер для команд от Edge Functions / фронта.
 *  2. Загружаем активные сессии из БД, поднимаем gramjs-клиенты в памяти.
 *  3. Слушаем апдейты Telegram (входящие сообщения, реакции, прочитанность)
 *     и пишем в Supabase. (TODO: этап 4.)
 *  4. Graceful shutdown — отключаем сессии, чтобы не оставить «висящих»
 *     коннектов на стороне Telegram.
 */

import Fastify from "fastify"
import { config } from "./config.js"
import { authRoutes } from "./routes/auth.js"
import { commandsRoutes } from "./routes/commands.js"
import {
  bootstrapAllSessions,
  disconnectAll,
} from "./sessions/manager.js"

async function main() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: {
        target: "pino-pretty",
        options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      },
    },
    bodyLimit: 1024 * 1024, // 1 MB — для текста и команд хватит
  })

  app.get("/health", async () => ({ ok: true, ts: Date.now() }))

  await app.register(authRoutes)
  await app.register(commandsRoutes)

  app.setErrorHandler((err, _req, reply) => {
    app.log.error({ err }, "unhandled error")
    return reply.code(500).send({ error: "Internal Server Error" })
  })

  await app.listen({ host: config.HOST, port: config.PORT })
  app.log.info(`HTTP listening on ${config.HOST}:${config.PORT}`)

  // Параллельно с HTTP — поднимаем сессии. Не блокирующе: если Telegram
  // временно недоступен, /health должен отвечать.
  bootstrapAllSessions().catch((err) =>
    app.log.error({ err }, "bootstrapAllSessions failed"),
  )

  // Graceful shutdown — отключаем gramjs-клиенты, чтобы Telegram сразу
  // увидел «оффлайн» вместо висящего коннекта.
  const shutdown = async (signal: string) => {
    app.log.warn(`received ${signal}, shutting down…`)
    try {
      await app.close()
    } catch (err) {
      app.log.error({ err }, "fastify close error")
    }
    try {
      await disconnectAll()
    } catch (err) {
      app.log.error({ err }, "session disconnect error")
    }
    process.exit(0)
  }
  process.on("SIGTERM", () => void shutdown("SIGTERM"))
  process.on("SIGINT", () => void shutdown("SIGINT"))
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[index] fatal:", err)
  process.exit(1)
})
