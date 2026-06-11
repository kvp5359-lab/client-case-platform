/**
 * Сервис для раздела "Входящие" — список тредов (v2: по тредам, не по проектам).
 *
 * Версия v1 (`get_inbox_threads`, `InboxThread`) удалена из TS-кода в рамках
 * аудита 2026-04-11, П5.1 — все потребители переведены на v2. Сам RPC
 * `get_inbox_threads` пока остаётся в БД как legacy (см. Зону 2 аудита), но
 * клиентский код его не вызывает.
 */

import { supabase } from '@/lib/supabase'
import { ApiError } from '@/services/errors/AppError'

export type InboxChannelType = 'web' | 'telegram' | 'email'

export type InboxThreadEntry = {
  thread_id: string
  thread_name: string
  thread_icon: string
  thread_accent_color: string
  /** 'task' | 'chat' — из project_threads.type. Нужен TaskPanel, чтобы правильно показать дропдаун статуса. */
  thread_type: 'task' | 'chat'
  /**
   * `null` для workspace-level тредов (не привязаны к проекту).
   * v2 RPC реально возвращает null для таких — project_threads_insert policy
   * разрешает их через workspace_id + access_type='custom'.
   */
  project_id: string | null
  /**
   * `null` синхронно с `project_id`: у workspace-level тредов нет проекта,
   * а значит и имени проекта. UI должен показывать fallback вроде
   * «Рабочая область» / имя воркспейса.
   */
  project_name: string | null
  channel_type: InboxChannelType
  /** legacy_channel из project_threads: 'client' | 'internal' | null (для custom тредов) */
  legacy_channel: string | null
  last_message_at: string | null
  last_message_text: string | null
  /** Имя первого вложения последнего сообщения — показываем в превью, если у сообщения нет текста. */
  last_message_attachment_name: string | null
  /** Количество вложений в последнем сообщении. 0 — вложений нет. */
  last_message_attachment_count: number
  /** MIME-тип первого вложения last_message — используется для иконки и подписи
   *  («🎤 Голосовое», «🖼 Изображение») в превью inbox, когда текст пустой/плейсхолдер.
   *  Опционально: сущестующие mock'и в тестах и фолбэк-выборки могут не передавать
   *  его — фронт работает с `null`/`undefined` одинаково (см. `getMediaPreview`). */
  last_message_attachment_mime?: string | null
  last_sender_name: string | null
  last_sender_avatar_url: string | null
  unread_count: number
  manually_unread: boolean
  has_unread_reaction: boolean
  /** Сколько непрочитанных реакций в треде. `has_unread_reaction = unread_reaction_count > 0`. */
  unread_reaction_count: number
  last_reaction_emoji: string | null
  /** Timestamp of the latest reaction on any message in this thread. */
  last_reaction_at: string | null
  /** Display name of the user who placed the latest reaction. */
  last_reaction_sender_name: string | null
  /** Avatar URL of the user who placed the latest reaction. */
  last_reaction_sender_avatar_url: string | null
  /** Raw HTML content of the message that was reacted to — needs stripping before display. */
  last_reaction_message_preview: string | null
  /** Email-адрес собеседника треда (из RPC поле `email_contact`). */
  email_contact: string | null
  email_subject: string | null
  /** Audit: timestamp of last event (status change, rename, etc.) */
  last_event_at: string | null
  /** Audit: human-readable event description */
  last_event_text: string | null
  /** Audit: hex colour of the new status (only for change_status events) */
  last_event_status_color: string | null
  /** Audit: count of unread events */
  unread_event_count: number
  /**
   * Имя «собеседника» — автора последнего сообщения от не-сотрудника
   * (роль NOT IN team-ролях). `null`, если в треде писали только сотрудники.
   * UI использует для аватара/инициала в списке входящих.
   */
  counterpart_name: string | null
  /** Аватар «собеседника» (если есть participant с avatar_url). */
  counterpart_avatar_url: string | null
  /**
   * `last_read_at` пользователя для этого треда (из message_read_status).
   * `null` если тред никогда не открывался. Используется MessageBubble для
   * красного контура непрочитанных сообщений — сравнение с created_at.
   * Источник правды: единая строка inbox v2 для всех мест UI.
   */
  last_read_at: string | null
}

export async function getInboxThreadsV2(
  workspaceId: string,
  userId: string,
): Promise<InboxThreadEntry[]> {
  const { data, error } = await supabase.rpc('get_inbox_threads_v2', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  })

  if (error) throw new ApiError(`Ошибка загрузки входящих: ${error.message}`)
  return (data ?? []) as unknown as InboxThreadEntry[]
}

/** Статус доставки последнего исходящего сообщения треда (для галочки в превью). */
export type InboxMessageStatus = {
  thread_id: string
  delivery_status: 'pending' | 'sent' | 'read' | 'failed' | null
}

/**
 * Статусы доставки последних сообщений по тредам инбокса (RPC
 * `get_inbox_message_status`). `delivery_status` непустой только когда последнее
 * сообщение исходящее (наше). Отдельный лёгкий запрос — не трогает
 * get_inbox_threads_v2 и его обёртки.
 */
export async function getInboxMessageStatuses(
  workspaceId: string,
  userId: string,
): Promise<InboxMessageStatus[]> {
  const { data, error } = await supabase.rpc('get_inbox_message_status' as never, {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  } as never)

  if (error) throw new ApiError(`Ошибка загрузки статусов доставки: ${error.message}`)
  return (data ?? []) as unknown as InboxMessageStatus[]
}

/**
 * Поиск по тредам входящих по названию треда / имени проекта (RPC
 * `get_inbox_search_threads`). Серверный — по ВСЕМ тредам инбокса, а не по
 * загруженным в браузер страницам. Пустой запрос → пустой результат.
 */
export async function getInboxSearchThreads(
  workspaceId: string,
  userId: string,
  query: string,
): Promise<InboxThreadEntry[]> {
  const { data, error } = await supabase.rpc('get_inbox_search_threads' as never, {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_query: query,
  } as never)

  if (error) throw new ApiError(`Ошибка поиска по входящим: ${error.message}`)
  return (data ?? []) as unknown as InboxThreadEntry[]
}

/**
 * Одна строка инбокса для конкретного треда (RPC `get_inbox_thread_one`).
 * Источник надёжных last_read_at/unread_count для ОТКРЫТОГО треда — не зависит
 * от того, попал ли тред в пагинированный список useInboxThreadsV2 (иначе для
 * треда за пределами загруженных страниц last_read_at приходил null → ложные
 * красные «непрочитанные» баблы). Возвращает null, если тред недоступен.
 */
export async function getInboxThreadOne(
  workspaceId: string,
  userId: string,
  threadId: string,
): Promise<InboxThreadEntry | null> {
  const { data, error } = await supabase.rpc('get_inbox_thread_one' as never, {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_thread_id: threadId,
  } as never)

  if (error) throw new ApiError(`Ошибка загрузки треда: ${error.message}`)
  const rows = (data ?? []) as unknown as InboxThreadEntry[]
  return rows[0] ?? null
}

/**
 * Все непрочитанные треды инбокса одним запросом, без пагинации (RPC
 * `get_inbox_unread_threads`, потолок 100). Источник для вкладки «Непрочитанные»:
 * непрочитанных всегда единицы, поэтому keyset-пагинация (и её каскад догрузки)
 * тут не нужна. Возвращает те же поля, что `get_inbox_threads_v2`.
 */
export async function getInboxUnreadThreads(
  workspaceId: string,
  userId: string,
): Promise<InboxThreadEntry[]> {
  const { data, error } = await supabase.rpc('get_inbox_unread_threads' as never, {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  } as never)

  if (error) throw new ApiError(`Ошибка загрузки непрочитанных: ${error.message}`)
  return (data ?? []) as unknown as InboxThreadEntry[]
}

/**
 * Лёгкая строка-агрегат — только поля для счётчиков сайдбара/favicon.
 * Без имён, текстов, аватаров. Источник — RPC `get_inbox_thread_aggregates`.
 */
export type InboxThreadAggregate = {
  thread_id: string
  project_id: string | null
  legacy_channel: string | null
  thread_accent_color: string | null
  last_message_at: string | null
  unread_count: number
  unread_event_count: number
  unread_reaction_count: number
  has_unread_reaction: boolean
  manually_unread: boolean
  last_reaction_emoji: string | null
}

export async function getInboxThreadAggregates(
  workspaceId: string,
  userId: string,
): Promise<InboxThreadAggregate[]> {
  const { data, error } = await supabase.rpc('get_inbox_thread_aggregates' as never, {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  } as never)

  if (error) throw new ApiError(`Ошибка загрузки агрегатов: ${error.message}`)
  return (data ?? []) as unknown as InboxThreadAggregate[]
}

/** Keyset-курсор для пагинации инбокса. NULL — первая страница. */
export type InboxPageCursor = {
  sortAt: string
  threadId: string
} | null

/** Размер одной страницы. Согласован с RPC-дефолтом (50). Меняется одновременно. */
export const INBOX_PAGE_SIZE = 50

/** Тред из пагинированного RPC — те же поля, что в `InboxThreadEntry`, + `sort_at` для курсора. */
export type InboxThreadPageEntry = InboxThreadEntry & {
  sort_at: string | null
}

/** Один «страничный» результат для useInfiniteQuery. */
export type InboxThreadsPage = {
  items: InboxThreadPageEntry[]
  nextCursor: InboxPageCursor
}

export async function getInboxThreadsPage(
  workspaceId: string,
  userId: string,
  cursor: InboxPageCursor,
  limit: number = INBOX_PAGE_SIZE,
): Promise<InboxThreadsPage> {
  const { data, error } = await supabase.rpc('get_inbox_threads_page' as never, {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_cursor_sort_at: cursor?.sortAt ?? null,
    p_cursor_thread_id: cursor?.threadId ?? null,
    p_limit: limit,
  } as never)

  if (error) throw new ApiError(`Ошибка загрузки страницы входящих: ${error.message}`)
  const items = (data ?? []) as unknown as InboxThreadPageEntry[]

  // Если страница полная — есть смысл запрашивать следующую: курсор — sort_at + thread_id последнего ряда.
  const last = items.length === limit ? items[items.length - 1] : null
  const nextCursor: InboxPageCursor =
    last && last.sort_at
      ? { sortAt: last.sort_at, threadId: last.thread_id }
      : null

  return { items, nextCursor }
}
