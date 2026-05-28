/**
 * Query keys для всего мессенджера: чаты, входящие, личные диалоги,
 * AI-кэш по проекту, реакции, треды-сущности. Здесь же helpers для
 * broad-invalidate (`invalidateMessengerCaches`, `invalidateAfterThreadMove`).
 */

import { accessibleProjectKeys, projectKeys } from './projects'
import { sidebarKeys, workspaceThreadKeys } from './workspace'
import { myTaskCountsKeys } from './misc'

export const inboxKeys = {
  all: ['inbox'] as const,
  /** Ключ inbox-кеша (thread-level). v1 удалён, остался только v2. */
  threads: (workspaceId: string) => ['inbox', 'threads-v2', workspaceId] as const,
  /**
   * Лёгкий ключ для агрегатов сайдбар-бейджей и favicon (get_inbox_thread_aggregates).
   * Возвращает только цифры по тредам — без имён, текстов, аватаров.
   * Снимает зависимость счётчиков от тяжёлого RPC, чтобы пагинация фазы 2 не сломала их.
   */
  aggregates: (workspaceId: string) => ['inbox', 'aggregates', workspaceId] as const,
}

/**
 * Журнал ошибок отправки сообщений (`message_send_failures`).
 * `myUnresolved` — мои незакрытые ошибки в воркспейсе (для бейджа и тоста).
 * `workspaceAll` — все ошибки воркспейса (для страницы менеджера).
 */
export const sendFailureKeys = {
  all: ['send-failures'] as const,
  myUnresolved: (workspaceId: string) =>
    ['send-failures', 'my-unresolved', workspaceId] as const,
  workspaceAll: (workspaceId: string, includeResolved: boolean) =>
    ['send-failures', 'workspace-all', workspaceId, includeResolved] as const,
}

export const personalDialogsKeys = {
  all: ['personal-dialogs'] as const,
  forUser: (workspaceId: string, targetUserId: string) =>
    ['personal-dialogs', workspaceId, targetUserId] as const,
}

/**
 * Messenger-кэши привязаны к thread_id.
 * Legacy-режим (projectId+channel) удалён в рамках audit S1 cleanup:
 * все callers используют threadId-based ключи, в БД нет сообщений без thread_id.
 */
export const messengerKeys = {
  all: ['messenger'] as const,
  messagesByThreadId: (threadId: string) => ['messenger', 'messages', 'chat', threadId] as const,
  unreadCountByThreadId: (threadId: string) =>
    ['messenger', 'unread-count', 'chat', threadId] as const,
  telegramLinkByThreadId: (threadId: string) =>
    ['messenger', 'telegram-link', 'chat', threadId] as const,
  lastReadAtByThreadId: (threadId: string) =>
    ['messenger', 'last-read-at', 'chat', threadId] as const,
  /** Агрегированная карта last_read_at по всем тредам проекта — для «Всей истории» в TaskPanel. */
  lastReadAtByProject: (projectId: string, userId: string) =>
    ['messenger', 'last-read-at', 'project', projectId, userId] as const,
  /**
   * Префикс для broad-invalidate карты last_read_at в проекте — без userId.
   * React Query matches partial prefix → попадёт в lastReadAtByProject любого
   * пользователя в кэше (фактически только один — сам пользователь сессии).
   */
  lastReadAtByProjectPrefix: (projectId: string) =>
    ['messenger', 'last-read-at', 'project', projectId] as const,
  searchByThreadId: (threadId: string, query: string) =>
    ['messenger', 'search', 'chat', threadId, query] as const,
  projectThreads: (projectId: string) => ['messenger', 'project-chats', projectId] as const,
}

/**
 * Messenger AI context data (documents, form-kits).
 */
export const messengerAiKeys = {
  all: ['messenger-ai'] as const,
  documents: (projectId: string) => ['messenger-ai', 'documents', projectId] as const,
  formKits: (projectId: string) => ['messenger-ai', 'form-kits', projectId] as const,
}

/**
 * Current participant for messenger (project or workspace level).
 */
export const messengerParticipantKeys = {
  current: (scopeId: string, userId: string | undefined) =>
    ['messenger', 'current-participant', scopeId, userId] as const,
}

/**
 * Chat state — single RPC preload (participant, telegram, email, unread, last_read_at).
 */
export const chatStateKeys = {
  byThread: (threadId: string | undefined, userId: string | undefined) =>
    ['chat-state', threadId, userId] as const,
}

/**
 * Chat settings data helpers.
 */
export const chatSettingsKeys = {
  workspaceProjects: (workspaceId: string | undefined) =>
    ['workspace-projects-list', workspaceId] as const,
  emailSuggestions: (workspaceId: string | undefined) =>
    ['email-suggestions', workspaceId] as const,
}

/**
 * Inbox thread detail (deadline etc.).
 */
export const inboxThreadDetailKeys = {
  byThread: (threadId: string) => ['inbox-thread-detail', threadId] as const,
}

/** Кеш списка тредов контакта (используется в карточке контакта). */
export const contactThreadKeys = {
  all: ['contact-threads'] as const,
  byParticipant: (participantId: string) =>
    ['contact-threads', participantId] as const,
}

/** Настройки email для конкретного треда (`thread-email-settings`). */
export const threadEmailSettingsKeys = {
  all: ['thread-email-settings'] as const,
  byThread: (threadId: string) => ['thread-email-settings', threadId] as const,
}

/** Скоуп треда для tab-shell (`thread-scope`). */
export const threadScopeKeys = {
  all: ['thread-scope'] as const,
  byThread: (threadRefId: string) => ['thread-scope', threadRefId] as const,
}

/**
 * Timeline messages (merged view across threads).
 */
export const timelineKeys = {
  messages: (projectId: string, threadIds: string[]) =>
    ['timeline', 'messages-v2', projectId, [...threadIds].sort().join(',')] as const,
}

/**
 * Инвалидировать все кэши мессенджера: inbox v2 + sidebar projects.
 * Вызывать после markAsRead, markAsUnread, отправки сообщения, реакций и т.д.
 */
export function invalidateMessengerCaches(
  queryClient: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => void },
  workspaceId: string,
) {
  queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
  queryClient.invalidateQueries({ queryKey: inboxKeys.aggregates(workspaceId) })
  queryClient.invalidateQueries({ queryKey: sidebarKeys.projects(workspaceId, true) })
  queryClient.invalidateQueries({ queryKey: sidebarKeys.projects(workspaceId, false) })
}

/**
 * Инвалидировать кеши после перемещения треда между контекстами (между
 * проектами / в/из «Личных диалогов» / при merge участников). Сбрасывает
 * все списки тредов, инбоксы, сайдбар и счётчики.
 *
 * Заменяет руками выписанные пакеты broad-invalidate вроде
 * `['sidebar'] / ['threads'] / ['messenger'] / ['personal-dialogs'] /
 * ['inbox'] / ['workspace', workspaceId]` — часть из которых не
 * совпадала ни с одним реальным префиксом и фактически ничего не
 * инвалидировала (`['threads']`, `['workspace', workspaceId]`).
 */
export function invalidateAfterThreadMove(
  queryClient: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => void },
  workspaceId: string | undefined,
) {
  queryClient.invalidateQueries({ queryKey: messengerKeys.all })
  queryClient.invalidateQueries({ queryKey: personalDialogsKeys.all })
  queryClient.invalidateQueries({ queryKey: inboxKeys.all })
  queryClient.invalidateQueries({ queryKey: contactThreadKeys.all })
  queryClient.invalidateQueries({ queryKey: ['sidebar'] })
  if (workspaceId) {
    queryClient.invalidateQueries({ queryKey: workspaceThreadKeys.workspace(workspaceId) })
    queryClient.invalidateQueries({ queryKey: projectKeys.byWorkspace(workspaceId) })
    queryClient.invalidateQueries({ queryKey: accessibleProjectKeys.workspace(workspaceId) })
    queryClient.invalidateQueries({ queryKey: myTaskCountsKeys.byWorkspace(workspaceId) })
  }
}
