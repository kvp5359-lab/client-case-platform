/**
 * Messenger read paths — list messages by thread / project / channel.
 * Все три функции работают на одинаковой схеме: select + cursor pagination
 * + hydrate reply chain. Вынесены из messengerService.ts чтобы тот остался
 * чисто barrel'ом + Send/Edit/Delete.
 */

import { supabase } from '@/lib/supabase'
import { ConversationError } from '@/services/errors/AppError'
import {
  MESSAGE_SELECT,
  castToProjectMessages,
  hydrateReplyMessages,
} from './messengerService.helpers'
import type { MessageChannel, ProjectMessage } from './messengerService.types'

/**
 * Load a page of messages in a thread (cursor pagination, newest first).
 *
 * Раньше функция умела работать и в legacy-режиме по (projectId, channel),
 * но все треды в базе имеют thread_id, и все callers фронта всегда передают
 * threadId. Legacy-ветка удалена — см. audit S1.
 */
export async function getMessages(
  threadId: string,
  options: { before?: string; limit?: number } = {},
): Promise<{ messages: ProjectMessage[]; hasMore: boolean }> {
  const limit = options.limit ?? 50

  let query = supabase
    .from('project_messages')
    .select(MESSAGE_SELECT)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (options.before) {
    query = query.lt('created_at', options.before)
  }

  const { data, error } = await query

  if (error) throw new ConversationError(`Ошибка загрузки сообщений: ${error.message}`)

  const messages = castToProjectMessages(data ?? [])
  const hasMore = messages.length > limit
  if (hasMore) messages.pop()

  await hydrateReplyMessages(messages)

  return { messages: messages.reverse(), hasMore }
}

/**
 * Загрузить сообщения проекта по каналу (`client` / `internal`) для AI-агрегации.
 *
 * Отличается от getMessages: фильтрует по project_id + channel вместо thread_id,
 * потому что AI-ассистент показывает переписку проекта целиком, через все треды
 * канала. Используется только в ProjectAiChat — обычный чат/мессенджер грузит
 * через getMessages(threadId).
 */
export async function getProjectMessagesByChannel(
  projectId: string,
  channel: MessageChannel,
  options: { limit?: number } = {},
): Promise<{ messages: ProjectMessage[]; hasMore: boolean }> {
  const limit = options.limit ?? 50

  const { data, error } = await supabase
    .from('project_messages')
    .select(MESSAGE_SELECT)
    .eq('project_id', projectId)
    .eq('channel', channel)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (error) throw new ConversationError(`Ошибка загрузки сообщений: ${error.message}`)

  const messages = castToProjectMessages(data ?? [])
  const hasMore = messages.length > limit
  if (hasMore) messages.pop()

  await hydrateReplyMessages(messages)

  return { messages: messages.reverse(), hasMore }
}

/**
 * Догрузить старую историю сообщений через MTProto. Зовётся фронтом, когда
 * сотрудник прокрутил тред вверх до самого старого сообщения в БД и нажал
 * «Загрузить ещё из Telegram».
 *
 * Под капотом edge function проксирует в mtproto-service, тот делает
 * `Api.messages.GetHistory` с offset_id = min(telegram_message_id треда),
 * limit=50, и инсёртит каждое сообщение через ту же логику, что и realtime.
 *
 * Возвращает `inserted` — реально вставленных строк (дубли отсеиваются
 * UNIQUE-индексом), `fetched` — сколько Telegram вернул всего,
 * `has_more` — true если Telegram отдал полный батч (значит ещё есть, что
 * листать). На FLOOD_WAIT возвращает 429 с retry_after_seconds — фронт
 * должен показать соответствующее сообщение.
 */
export async function backfillTelegramHistory(
  threadId: string,
): Promise<{ inserted: number; fetched: number; hasMore: boolean }> {
  const { data, error } = await supabase.functions.invoke(
    'telegram-mtproto-backfill',
    { body: { thread_id: threadId } },
  )
  if (error) {
    // Edge runtime кладёт текст в error.context.response для не-2xx.
    type FuncErrCtx = { response?: Response }
    const ctx = (error as { context?: FuncErrCtx }).context
    let bodyText: string | undefined
    if (ctx?.response) {
      try {
        bodyText = await ctx.response.clone().text()
      } catch {
        /* ignore */
      }
    }
    throw new ConversationError(
      `Не удалось догрузить историю из Telegram: ${bodyText ?? error.message}`,
    )
  }
  const result = data as { inserted?: number; fetched?: number; has_more?: boolean }
  return {
    inserted: result.inserted ?? 0,
    fetched: result.fetched ?? 0,
    hasMore: result.has_more ?? false,
  }
}

/**
 * Загрузить сообщения проекта по списку тредов (или все треды проекта, если threadIds=null).
 * Используется AI-ассистентом для скоупа поиска по чатам.
 */
export async function getProjectMessages(
  projectId: string,
  threadIds: string[] | null,
  options: { limit?: number } = {},
): Promise<{ messages: ProjectMessage[]; hasMore: boolean }> {
  const limit = options.limit ?? 200

  if (threadIds && threadIds.length === 0) {
    return { messages: [], hasMore: false }
  }

  let query = supabase
    .from('project_messages')
    .select(MESSAGE_SELECT)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (threadIds) {
    query = query.in('thread_id', threadIds)
  }

  const { data, error } = await query

  if (error) throw new ConversationError(`Ошибка загрузки сообщений: ${error.message}`)

  const messages = castToProjectMessages(data ?? [])
  const hasMore = messages.length > limit
  if (hasMore) messages.pop()

  await hydrateReplyMessages(messages)

  return { messages: messages.reverse(), hasMore }
}
