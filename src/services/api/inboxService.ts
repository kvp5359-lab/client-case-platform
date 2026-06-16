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
  /**
   * Аватар автора последнего события (кто менял статус/дедлайн и т.п.).
   * Используется в многоучастниковых тредах (задачи, TG-группы), где аватар
   * строки = тот, чьё действие сейчас показано. `null`, если события нет или
   * у автора нет аватара.
   */
  last_event_sender_avatar_url: string | null
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
  const { data, error } = await supabase.rpc('get_inbox_message_status', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  })

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
  const { data, error } = await supabase.rpc('get_inbox_search_threads', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_query: query,
  })

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
  const { data, error } = await supabase.rpc('get_inbox_thread_one', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_thread_id: threadId,
  })

  if (error) throw new ApiError(`Ошибка загрузки треда: ${error.message}`)
  const rows = (data ?? []) as unknown as InboxThreadEntry[]
  return rows[0] ?? null
}

/**
 * Все непрочитанные треды инбокса одним запросом, без пагинации и БЕЗ потолка
 * (RPC `get_inbox_unread_threads`). Источник для вкладки «Непрочитанные».
 * Осознанно помеченные (manually_unread) идут первыми. Keyset-пагинация тут
 * недопустима — вернёт каскад догрузки из-за клиентского access-фильтра.
 * Возвращает те же поля, что `get_inbox_threads_v2`.
 */
export async function getInboxUnreadThreads(
  workspaceId: string,
  userId: string,
): Promise<InboxThreadEntry[]> {
  const { data, error } = await supabase.rpc('get_inbox_unread_threads', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  })

  if (error) throw new ApiError(`Ошибка загрузки непрочитанных: ${error.message}`)
  return (data ?? []) as unknown as InboxThreadEntry[]
}

/**
 * Треды «Ждут ответа» одним запросом (RPC `get_inbox_awaiting_reply_threads`) —
 * внешние диалоги, где ПОСЛЕДНЕЕ сообщение отправили мы (sender_role ∈ команда),
 * т.е. ждём ответа собеседника. Источник вкладки «Ждут ответа». Решает кейс
 * «написал клиенту первым в TG/WhatsApp — тред создан, но в "Непрочитанных" не
 * виден». Взаимоисключающе с непрочитанными (там последнее сообщение — входящее).
 * Без пагинации (как unread): keyset недопустим из-за клиентского access-фильтра.
 * Возвращает те же поля, что `get_inbox_threads_v2`.
 */
export async function getInboxAwaitingReplyThreads(
  workspaceId: string,
  userId: string,
): Promise<InboxThreadEntry[]> {
  const { data, error } = await supabase.rpc('get_inbox_awaiting_reply_threads', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  })

  if (error) throw new ApiError(`Ошибка загрузки «Ждут ответа»: ${error.message}`)
  return (data ?? []) as unknown as InboxThreadEntry[]
}

/**
 * Треды «Нужно ответить» одним запросом (RPC `get_inbox_needs_reply_threads`) —
 * внешние диалоги, где ПОСЛЕДНЕЕ сообщение от клиента и всё прочитано (ты видел,
 * но не ответил). Источник вкладки «Нужно ответить». Инверсия «Ждём клиента»;
 * гейт «прочитано» исключает пересечение с «Непрочитанными» (там приоритет).
 * Без пагинации (как unread/awaiting) — клиентский access-фильтр.
 */
export async function getInboxNeedsReplyThreads(
  workspaceId: string,
  userId: string,
): Promise<InboxThreadEntry[]> {
  const { data, error } = await supabase.rpc('get_inbox_needs_reply_threads', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  })

  if (error) throw new ApiError(`Ошибка загрузки «Нужно ответить»: ${error.message}`)
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
  /**
   * Последнее НЕ-сервисное сообщение треда отправил сотрудник (staff)?
   * Зеркало предиката `is_staff_role(sender_role)` в обёртках needs/awaiting:
   * `null` — собеседник (роль не staff / NULL). Используется для подсчёта
   * сегментов «Нужно ответить» / «Ждём клиента» на клиенте без тяжёлых обёрток.
   */
  last_from_staff: boolean | null
  /** В треде есть хотя бы одно сообщение из внешнего канала (TG/Wazzup/Email). */
  has_external: boolean
}

/**
 * Лёгкие агрегаты по ВСЕМ доступным тредам — источник счётчиков непрочитанного
 * (сайдбар, favicon), бейджей вкладок панели, кнопки «Прочитано/Непрочитано» и
 * счётчиков сегментов инбокса. RPC сортирует по thread_id (ORDER BY at.id).
 *
 * ⚠️ Пагинация ОБЯЗАТЕЛЬНА. Supabase REST отдаёт максимум 1000 строк за запрос.
 * Воркспейсы с >1000 тредов без пагинации теряли «хвост» — тред за границей 1000
 * выпадал из агрегатов, и кнопка/бейджи/счётчики на нём считали «прочитано»
 * (баг 2026-06-15: непрочитанный тред без бейджа и с кнопкой «Непрочитано»).
 * Тянем постранично по 1000 (как boardFilterService), стабильный порядок — из RPC.
 */
const AGGREGATES_PAGE = 1000

export async function getInboxThreadAggregates(
  workspaceId: string,
  userId: string,
): Promise<InboxThreadAggregate[]> {
  const all: InboxThreadAggregate[] = []
  for (let from = 0; ; from += AGGREGATES_PAGE) {
    const { data, error } = await supabase
      .rpc('get_inbox_thread_aggregates', {
        p_workspace_id: workspaceId,
        p_user_id: userId,
      })
      .range(from, from + AGGREGATES_PAGE - 1)

    if (error) throw new ApiError(`Ошибка загрузки агрегатов: ${error.message}`)
    const batch = (data ?? []) as unknown as InboxThreadAggregate[]
    all.push(...batch)
    if (batch.length < AGGREGATES_PAGE) break
  }
  return all
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
  const { data, error } = await supabase.rpc('get_inbox_threads_page', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_cursor_sort_at: cursor?.sortAt ?? undefined,
    p_cursor_thread_id: cursor?.threadId ?? undefined,
    p_limit: limit,
  })

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
