"use client"

/**
 * useMessengerPanelData — агрегирует все данные для MessengerPanelContent.
 * Вынесено из MessengerPanelContent.tsx для уменьшения размера компонента.
 */

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { calcThreadUnread } from '@/utils/inboxUnread'
import { supabase } from '@/lib/supabase'
import {
  useThreadIdByChannel,
  useDeleteThread,
  usePinThread,
} from '@/hooks/messenger/useProjectThreads'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useUnreadCount } from '@/hooks/messenger/useUnreadCount'
import {
  useHasUnreadReaction,
  useUnreadReactionCount,
  useUnreadReactionEmoji,
  useIsManuallyUnread,
} from '@/hooks/messenger/useInbox'
import { useFilteredInbox } from '@/hooks/messenger/useFilteredInbox'
import { useThreadMembersMap } from '@/components/tasks/useThreadMembersMap'
import { useThreadTemplatesForProject } from '@/hooks/messenger/useThreadTemplates'
import { useAccessibleThreadIds } from '@/hooks/messenger/useAccessibleThreadIds'
import { participantKeys, projectTemplateKeys, STALE_TIME } from '@/hooks/queryKeys'

/** Названия ролей проекта для tooltip */
const PROJECT_ROLE_LABELS: Record<string, string> = {
  Администратор: 'Администраторы',
  Исполнитель: 'Исполнители',
  Клиент: 'Клиенты',
  Участник: 'Наблюдатели',
}

function formatParticipantName(p: { name: string; last_name: string | null }): string {
  return p.last_name ? `${p.name} ${p.last_name}` : p.name
}

export function useMessengerPanelData(projectId: string, workspaceId: string) {
  // Thread ID helpers
  const clientChatId = useThreadIdByChannel(projectId, 'client')
  const internalChatId = useThreadIdByChannel(projectId, 'internal')

  // All threads + access filtering
  const {
    accessibleChats,
    allThreads: chats,
    threadsLoading: chatsLoading,
  } = useAccessibleThreadIds(projectId)

  // Unread counts for legacy channels
  const { data: clientUnread = 0 } = useUnreadCount(projectId, 'client', undefined, clientChatId)
  const { data: internalUnread = 0 } = useUnreadCount(
    projectId,
    'internal',
    undefined,
    internalChatId,
  )

  // Reactions / manually unread
  const { data: hasClientReaction = false } = useHasUnreadReaction(workspaceId, projectId, 'client')
  const { data: clientReactionCount = 0 } = useUnreadReactionCount(
    workspaceId,
    projectId,
    'client',
  )
  const { data: reactionEmoji = null } = useUnreadReactionEmoji(workspaceId, projectId)
  const { data: isClientManuallyUnread = false } = useIsManuallyUnread(
    workspaceId,
    projectId,
    'client',
  )
  const { data: isInternalManuallyUnread = false } = useIsManuallyUnread(
    workspaceId,
    projectId,
    'internal',
  )

  // Mutations
  const deleteChatMutation = useDeleteThread(workspaceId)
  const pinThreadMutation = usePinThread()

  // Task statuses (for hiding completed tasks)
  const { data: taskStatuses = [] } = useTaskStatuses(workspaceId)
  const finalStatusIds = useMemo(
    () => new Set(taskStatuses.filter((s) => s.is_final).map((s) => s.id)),
    [taskStatuses],
  )

  // Inbox threads (filtered by access)
  const { data: inboxThreads = [] } = useFilteredInbox(workspaceId)
  const unreadThreadIds = useMemo(
    () =>
      new Set(
        inboxThreads
          .filter((t) => t.unread_count > 0 || t.has_unread_reaction || t.manually_unread || (t.unread_event_count ?? 0) > 0)
          .map((t) => t.thread_id),
      ),
    [inboxThreads],
  )

  // Raw unread data by thread_id (for getBadgeDisplay in MessengerPanelContent)
  const unreadByThreadId = useMemo(() => {
    const map: Record<
      string,
      {
        count: number
        unreadCount: number
        manuallyUnread: boolean
        hasReaction: boolean
        reactionCount: number
        reactionEmoji: string | null
        eventCount: number
      }
    > = {}
    for (const t of inboxThreads) {
      map[t.thread_id] = {
        count: calcThreadUnread(t),
        unreadCount: t.unread_count,
        manuallyUnread: !!t.manually_unread,
        hasReaction: !!t.has_unread_reaction,
        reactionCount: t.unread_reaction_count ?? (t.has_unread_reaction ? 1 : 0),
        reactionEmoji: t.last_reaction_emoji ?? null,
        eventCount: t.unread_event_count ?? 0,
      }
    }
    return map
  }, [inboxThreads])

  // Project participants (for access tooltips)
  const { data: projectParticipants = [] } = useQuery({
    queryKey: participantKeys.projectWithRoles(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_participants')
        .select(
          'participant_id, project_roles, participants!inner(id, name, last_name, is_deleted)',
        )
        .eq('project_id', projectId)
      if (error) throw error
      return (data ?? [])
        .filter((pp) => {
          const p = pp.participants as unknown as { is_deleted?: boolean }
          return !p.is_deleted
        })
        .map((pp) => {
          const participant = pp.participants as unknown as {
            id: string
            name: string
            last_name: string | null
          }
          return {
            ...participant,
            project_roles: (pp.project_roles ?? []) as string[],
          }
        })
    },
    enabled: !!projectId,
    staleTime: STALE_TIME.STANDARD,
  })

  // Members for custom threads (for tooltips)
  const customThreadIds = useMemo(
    () => accessibleChats.filter((c) => c.access_type === 'custom').map((c) => c.id),
    [accessibleChats],
  )
  const { data: threadMembersMap = {} } = useThreadMembersMap(customThreadIds)

  // Sticky task tabs: задачи, которые в этой сессии уже засветились во
  // вкладках (т.е. были непрочитанными), остаются видимыми до перезагрузки
  // страницы — даже после пометки прочитанным или отправки сообщения.
  // Сбрасывается при смене проекта.
  const [stickyTaskIds, setStickyTaskIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setStickyTaskIds(new Set())
  }, [projectId])

  useEffect(() => {
    if (unreadThreadIds.size === 0) return
    const taskTypeById = new Map<string, string | null | undefined>()
    for (const c of accessibleChats) taskTypeById.set(c.id, c.type)
    setStickyTaskIds((prev) => {
      let next: Set<string> | null = null
      for (const id of unreadThreadIds) {
        if (taskTypeById.get(id) !== 'task') continue
        if (prev.has(id)) continue
        if (!next) next = new Set(prev)
        next.add(id)
      }
      return next ?? prev
    })
  }, [accessibleChats, unreadThreadIds])

  // Visible (sorted) chats — already access-filtered by useAccessibleThreadIds
  const visibleChats = useMemo(
    () =>
      accessibleChats
        .filter((c) => {
          if (c.is_pinned) return true
          if (unreadThreadIds.has(c.id)) return true
          if (c.type === 'task' && c.status_id && finalStatusIds.has(c.status_id)) return false
          if (c.type === 'task' && stickyTaskIds.has(c.id)) return true
          if (c.type === 'task' && !unreadThreadIds.has(c.id)) return false
          return true
        })
        .sort((a, b) => {
          // Pinned threads always first
          if (a.is_pinned && !b.is_pinned) return -1
          if (!a.is_pinned && b.is_pinned) return 1
          // Sort order: chats → emails → tasks
          const order = (t: typeof a) =>
            t.type === 'task' ? 2 : t.icon === 'mail' ? 1 : 0
          return order(a) - order(b)
        }),
    [accessibleChats, finalStatusIds, unreadThreadIds, stickyTaskIds],
  )

  // Access tooltip text per chat
  const chatAccessTooltips = useMemo(() => {
    const map: Record<string, string> = {}
    for (const chat of visibleChats) {
      if (chat.access_type === 'all') {
        const names = projectParticipants.map(formatParticipantName)
        map[chat.id] = names.length > 0 ? `Все участники:\n${names.join('\n')}` : 'Все участники'
      } else if (chat.access_type === 'roles') {
        const accessRoles = chat.access_roles ?? []
        const rolesLabel = accessRoles.map((r: string) => PROJECT_ROLE_LABELS[r] ?? r).join(', ')
        const matched = projectParticipants.filter((p) =>
          p.project_roles.some((r) => accessRoles.includes(r)),
        )
        const names = matched.map(formatParticipantName)
        map[chat.id] =
          names.length > 0 ? `${rolesLabel}:\n${names.join('\n')}` : rolesLabel || 'По ролям'
      } else if (chat.access_type === 'custom') {
        const members = threadMembersMap[chat.id] ?? []
        const names = members.map(formatParticipantName)
        map[chat.id] = names.length > 0 ? `Доступ:\n${names.join('\n')}` : 'Выборочный доступ'
      }
    }
    return map
  }, [visibleChats, projectParticipants, threadMembersMap])

  // Project template id (для фильтрации шаблонов тредов по типу проекта)
  const { data: projectTemplateId = null } = useQuery<string | null>({
    queryKey: projectTemplateKeys.idByProject(projectId),
    queryFn: async () => {
      if (!projectId) return null
      const { data, error } = await supabase
        .from('projects')
        .select('template_id')
        .eq('id', projectId)
        .maybeSingle()
      if (error) throw error
      return (data?.template_id as string | null) ?? null
    },
    enabled: !!projectId,
    staleTime: STALE_TIME.STANDARD,
  })

  // Thread templates: глобальные + привязанные к типу этого проекта.
  // Из них в меню "+" скрываем те, что уже имеют материализованный тред
  // в этом проекте (по source_template_id) — чтобы пользователь не создавал
  // дубли по шаблонам, которые уже отработали.
  const { data: allVisibleTemplates = [] } = useThreadTemplatesForProject(
    workspaceId,
    projectTemplateId,
  )
  const usedTemplateIds = useMemo(() => {
    const set = new Set<string>()
    for (const t of chats) {
      if (t.source_template_id) set.add(t.source_template_id)
    }
    return set
  }, [chats])
  const threadTemplates = useMemo(
    () => allVisibleTemplates.filter((t) => !usedTemplateIds.has(t.id)),
    [allVisibleTemplates, usedTemplateIds],
  )

  return {
    chats,
    chatsLoading,
    visibleChats,
    clientChatId,
    internalChatId,
    clientUnread,
    internalUnread,
    hasClientReaction,
    clientReactionCount,
    reactionEmoji,
    isClientManuallyUnread,
    isInternalManuallyUnread,
    unreadByThreadId,
    chatAccessTooltips,
    threadTemplates,
    deleteChatMutation,
    pinThreadMutation,
  }
}
