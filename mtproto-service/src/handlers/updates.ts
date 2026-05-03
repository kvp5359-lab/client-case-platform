/**
 * Регистрация всех handlers на TelegramClient сотрудника.
 *
 * Вызывается:
 *  - при bootstrap (sessions/manager.ts) для каждой загруженной активной сессии;
 *  - после успешного signIn (auth/flow.ts) для свежей сессии.
 *
 * Все handler'ы — устойчивы к ошибкам внутри: если что-то упало, мы
 * логируем и продолжаем слушать (иначе один кривой апдейт обрушит всю
 * подписку).
 */

import { TelegramClient, Api } from "telegram"
import { NewMessage } from "telegram/events/index.js"
import type { NewMessageEvent } from "telegram/events/NewMessage.js"
import { Raw } from "telegram/events/Raw.js"
import { handleNewMessage } from "./incoming.js"
import { handleRawUpdate } from "./raw.js"
import { logger } from "../utils/logger.js"

interface SessionContext {
  user_id: string
  workspace_id: string
  tg_user_id: number
}

export function registerHandlers(
  client: TelegramClient,
  ctx: SessionContext,
): void {
  // Высокоуровневый wrapper для NewMessage — gramjs красиво собирает peer,
  // sender, reply, message. incoming.ts делает фильтр private + вставку.
  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      await handleNewMessage(ctx, event)
    } catch (err) {
      logger.error(`[updates] handleNewMessage error for user_id=${ctx.user_id}:`, err)
    }
  }, new NewMessage({}))

  // Низкоуровневые: реакции, прочитанность, удаление, редактирование.
  client.addEventHandler(async (update: Api.TypeUpdate) => {
    try {
      await handleRawUpdate(ctx, update)
    } catch (err) {
      logger.error(`[updates] handleRawUpdate error for user_id=${ctx.user_id}:`, err)
    }
  }, new Raw({}))

  logger.info(`[updates] handlers registered for user_id=${ctx.user_id}`)
}
