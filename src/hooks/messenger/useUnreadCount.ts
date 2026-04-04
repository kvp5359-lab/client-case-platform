"use client"

/**
 * Хуки для счётчика непрочитанных и пометки прочитанного
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import {
  getUnreadCount,
  getLastReadAt,
  markAsRead,
  markAsUnread,
  getCurrentProjectParticipant,
  getCurrentWorkspaceParticipant,
  type MessageChannel,
} from '@/services/api/messengerService'
import { supabase } from '@/lib/supabase'
import { messengerKeys, invalidateMessengerCaches } from '@/hooks/queryKeys'
import { dismissProjectToasts } from './useMessageToastPayload'

/** Resolve participant: project-level if projectId given, else workspace-level */
async function resolveParticipant(
  projectId: string | undefined,
  workspaceId: string | undefined,
  userId: string,
) {
  if (projectId) {
    return (await getCurrentProjectParticipant(projectId, userId))?.participantId ?? null
  }
  if (workspaceId) {
    return (await getCurrentWorkspaceParticipant(workspaceId, userId))?.participantId ?? null
  }
  return null
}

export function useUnreadCount(
  projectId: string | undefined,
  channel: MessageChannel = 'client',
  participantId?: string,
  threadId?: string,
) {
  const { user } = useAuth()

  return useQuery({
    queryKey: threadId
      ? messengerKeys.unreadCountByThreadId(threadId)
      : messengerKeys.unreadCount(projectId ?? '', channel),
    queryFn: async () => {
      if (!user) return 0
      const pid =
        participantId ?? (await getCurrentProjectParticipant(projectId!, user.id))?.participantId
      if (!pid) return 0
      return getUnreadCount(pid, projectId, channel, threadId)
    },
    enabled: !!(projectId || threadId) && !!user,
    staleTime: 30_000,
  })
}

export function useLastReadAt(
  projectId: string | undefined,
  channel: MessageChannel = 'client',
  participantId?: string,
  threadId?: string,
) {
  const { user } = useAuth()

  return useQuery({
    queryKey: threadId
      ? messengerKeys.lastReadAtByThreadId(threadId)
      : messengerKeys.lastReadAt(projectId ?? '', channel),
    queryFn: async () => {
      if (!user) return null
      const pid =
        participantId ?? (await getCurrentProjectParticipant(projectId!, user.id))?.participantId
      if (!pid) return null
      return getLastReadAt(pid, projectId, channel, threadId)
    },
    enabled: !!(projectId || threadId) && !!user,
    staleTime: 30_000,
  })
}

export function useMarkAsRead(
  projectId: string | undefined,
  workspaceId?: string,
  channel: MessageChannel = 'client',
  participantId?: string,
  threadId?: string,
) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const unreadKey = threadId
    ? messengerKeys.unreadCountByThreadId(threadId)
    : messengerKeys.unreadCount(projectId ?? '', channel)
  const lastReadKey = threadId
    ? messengerKeys.lastReadAtByThreadId(threadId)
    : messengerKeys.lastReadAt(projectId ?? '', channel)

  return useMutation({
    mutationFn: async () => {
      if (!user) return
      const pid = participantId ?? (await resolveParticipant(projectId, workspaceId, user.id))
      if (!pid) return
      return markAsRead(pid, projectId, channel, threadId)
    },
    onSuccess: () => {
      queryClient.setQueryData(unreadKey, 0)
      queryClient.invalidateQueries({ queryKey: lastReadKey })
      if (workspaceId) invalidateMessengerCaches(queryClient, workspaceId)
      if (projectId) dismissProjectToasts(projectId)
    },
  })
}

export function useMarkAsUnread(
  projectId: string | undefined,
  workspaceId?: string,
  channel: MessageChannel = 'client',
  participantId?: string,
  threadId?: string,
) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const unreadKey = threadId
    ? messengerKeys.unreadCountByThreadId(threadId)
    : messengerKeys.unreadCount(projectId ?? '', channel)
  const lastReadKey = threadId
    ? messengerKeys.lastReadAtByThreadId(threadId)
    : messengerKeys.lastReadAt(projectId ?? '', channel)

  return useMutation({
    mutationFn: async () => {
      if (!user) return
      const pid = participantId ?? (await resolveParticipant(projectId, workspaceId, user.id))
      if (!pid) return
      await markAsUnread(pid, projectId, channel, threadId)
      if (projectId) {
        await supabase
          .from('projects')
          .update({ last_activity_at: new Date().toISOString() })
          .eq('id', projectId)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: unreadKey })
      queryClient.invalidateQueries({ queryKey: lastReadKey })
      if (workspaceId) invalidateMessengerCaches(queryClient, workspaceId)
    },
  })
}
