/**
 * Менеджер активных gramjs-клиентов.
 *
 * Ключевая идея: на каждого подключённого сотрудника висит долгоживущий
 * TelegramClient в памяти. При старте сервиса прогружаем сессии из БД
 * и поднимаем клиенты заново. При получении апдейта — роутим в handlers.
 *
 * Map не теряет state между HTTP-запросами в Fastify, потому что весь
 * сервис — один long-running Node-процесс. Это и причина, по которой
 * MTProto не реализуем на Edge Functions: там serverless без state.
 */

import { TelegramClient } from "telegram"
import { StringSession } from "telegram/sessions/index.js"
import { LogLevel } from "telegram/extensions/Logger.js"
import { config } from "../config.js"
import { decryptSession } from "../crypto.js"
import { supabase } from "../db.js"
import { logger } from "../utils/logger.js"
import { registerHandlers } from "../handlers/updates.js"

interface SessionRow {
  user_id: string
  workspace_id: string
  session_encrypted: string
  tg_user_id: number
  is_active: boolean
}

const clients = new Map<string, TelegramClient>()

export function getClient(userId: string): TelegramClient | undefined {
  return clients.get(userId)
}

export function setClient(userId: string, client: TelegramClient): void {
  const prev = clients.get(userId)
  clients.set(userId, client)
  // Переавторизация при живой сессии: gramjs-клиент старого коннекта иначе
  // осиротеет (не disconnect'ится) → утечка сокета/памяти. Гасим прежний
  // (fire-and-forget — ждать его teardown незачем, новый уже в map).
  if (prev && prev !== client) {
    void prev
      .disconnect()
      .then(() => prev.destroy())
      .catch((err) => logger.warn("[sessions] stale client disconnect error for", userId, err))
  }
}

export function getAllUserIds(): string[] {
  return Array.from(clients.keys())
}

export async function disconnectAndRemove(userId: string): Promise<void> {
  const c = clients.get(userId)
  clients.delete(userId)
  if (c) {
    try {
      await c.disconnect()
      await c.destroy()
    } catch (err) {
      logger.warn("[sessions] disconnect error for", userId, err)
    }
  }
}

/**
 * Прогрев entity-cache. Загружаем список диалогов и явно резолвим
 * каждого peer'а — это заполняет access_hash в cache, без чего
 * последующие send/react/read операции по голому user_id падают.
 *
 * limit=200 — Telegram отдаёт топ диалогов по последней активности,
 * больше для нашего use case не нужно (мы переписываемся с активными).
 */
export async function primeEntityCache(client: TelegramClient): Promise<void> {
  try {
    const dialogs = await client.getDialogs({ limit: 200 })
    logger.info(`[sessions] primed entity cache with ${dialogs.length} dialogs`)
  } catch (err) {
    logger.warn("[sessions] primeEntityCache failed (non-fatal):", err)
  }
}

/**
 * Отключает все клиенты — для graceful shutdown.
 */
export async function disconnectAll(): Promise<void> {
  const ids = getAllUserIds()
  await Promise.all(ids.map((id) => disconnectAndRemove(id)))
}

/**
 * Создаёт новый TelegramClient из расшифрованной строки сессии и подключает
 * его к Telegram. Не сохраняет в БД — это ответственность вызывающего
 * (auth.signIn / auth.checkPassword).
 */
export async function buildClient(stringSession: StringSession): Promise<TelegramClient> {
  const client = new TelegramClient(
    stringSession,
    config.TELEGRAM_API_ID,
    config.TELEGRAM_API_HASH,
    {
      connectionRetries: 5,
      // Включаем автоматический reconnect — критично для long-running сессий.
      autoReconnect: true,
    },
  )
  // Глушим встроенный logger gramjs (он шумный, INFO на каждый ping).
  client.setLogLevel(LogLevel.ERROR)
  return client
}

/**
 * Старт-ап: поднимаем клиенты для всех активных сессий из БД.
 * Если какая-то сессия не валидна (расшифровка упала / ключ ротировали /
 * Telegram отозвал) — помечаем её disconnected, не падая по сервису целиком.
 */
export async function bootstrapAllSessions(): Promise<void> {
  const { data, error } = await supabase
    .from("telegram_mtproto_sessions")
    .select("user_id, workspace_id, session_encrypted, tg_user_id, is_active")
    .eq("is_active", true)
  if (error) {
    logger.error("[sessions] bootstrap fetch error:", error)
    return
  }
  const rows = (data ?? []) as SessionRow[]
  logger.info(`[sessions] bootstrapping ${rows.length} active sessions`)

  for (const row of rows) {
    try {
      const decrypted = decryptSession(row.session_encrypted)
      const stringSession = new StringSession(decrypted)
      const client = await buildClient(stringSession)
      await client.connect()
      // Проверяем, что сессия живая.
      if (!(await client.isUserAuthorized())) {
        logger.warn(`[sessions] session for user_id=${row.user_id} is no longer authorized; marking inactive`)
        await client.disconnect()
        await markInactive(row.user_id, "session not authorized")
        continue
      }
      setClient(row.user_id, client)
      registerHandlers(client, {
        user_id: row.user_id,
        workspace_id: row.workspace_id,
        tg_user_id: row.tg_user_id,
      })
      // Прогреваем entity-cache: загружаем список диалогов. Без этого
      // gramjs не может найти access_hash для send/react/read по чистому
      // user_id, и операции падают с PEER_ID_INVALID.
      await primeEntityCache(client)
      logger.info(`[sessions] up: user_id=${row.user_id} tg_user_id=${row.tg_user_id}`)
    } catch (err) {
      logger.error(`[sessions] failed to bootstrap user_id=${row.user_id}:`, err)
      await markInactive(row.user_id, String(err))
    }
  }
}

async function markInactive(userId: string, reason: string): Promise<void> {
  await supabase
    .from("telegram_mtproto_sessions")
    .update({
      is_active: false,
      disconnected_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
  logger.warn(`[sessions] marked inactive: ${userId}, reason: ${reason}`)
}
