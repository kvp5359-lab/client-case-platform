"use client"

/**
 * Toast notifications for new messenger messages.
 * Workspace-level realtime subscription on project_messages INSERT.
 */

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { inboxKeys, messengerKeys, sidebarKeys, workspaceKeys } from '@/hooks/queryKeys'
import { getCurrentProjectParticipant, markAsRead } from '@/services/api/messenger/messengerService'
import type { InboxThread, InboxThreadEntry } from '@/services/api/inboxService'
import type { Workspace } from '@/types/entities'
import { buildToastContent } from './MessageToastContent'
import {
  type RealtimeMessagePayload,
  groupedLines,
  makeGroupKey,
  fetchAvatarUrl,
  parseTextLine,
} from './useMessageToastPayload'
import { playIncomingSound } from './useMessageSound'
import { globalOpenThread } from '@/components/tasks/TaskPanelContext'
import type { TaskItem } from '@/components/tasks/types'

export function useNewMessageToast(workspaceId: string | undefined) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const userRef = useRef(user)
  useEffect(() => {
    userRef.current = user
  }, [user])

  const myParticipantIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!workspaceId || !user) return
    supabase
      .from('participants')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .then(({ data }) => {
        myParticipantIdsRef.current = new Set(data?.map((p) => p.id) ?? [])
      })
  }, [workspaceId, user])

  const instanceId = useRef(Math.random().toString(36).slice(2))

  useEffect(() => {
    if (!workspaceId || !user) return

    // Уникальное имя канала для каждого монтирования (защита от React StrictMode)
    const toastChannelName = `msg-toast:${workspaceId}:${instanceId.current}`

    const channel = supabase
      .channel(toastChannelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        async (payload) => {
          const msg = payload.new as RealtimeMessagePayload
          const msgChannel: 'client' | 'internal' =
            msg.channel === 'internal' ? 'internal' : 'client'

          if (
            msg.sender_participant_id &&
            myParticipantIdsRef.current.has(msg.sender_participant_id)
          )
            return

          const ws = queryClient.getQueryData<Workspace>(workspaceKeys.detail(workspaceId))
          const durationSec = ws?.notification_toast_duration ?? 5
          const duration = durationSec === 0 ? Infinity : durationSec * 1000

          const cachedThreads = queryClient.getQueryData<InboxThread[]>(
            inboxKeys.threads(workspaceId),
          )
          const projectName =
            cachedThreads?.find((c) => c.project_id === msg.project_id)?.project_name ?? 'Проект'

          // Получаем accent_color треда из v2 кэша
          const cachedThreadsV2 = queryClient.getQueryData<InboxThreadEntry[]>(
            inboxKeys.threadsV2(workspaceId),
          )
          const accentColor =
            cachedThreadsV2?.find((c) => c.thread_id === msg.thread_id)?.thread_accent_color ?? null

          const senderName = msg.sender_name ?? 'Участник'
          const messageId = (payload.new as { id: string }).id

          const textLine = await parseTextLine(msg.content, messageId)
          const groupKey = makeGroupKey(msg.project_id, msg.sender_participant_id)

          const avatarUrl = msg.sender_participant_id
            ? await fetchAvatarUrl(msg.sender_participant_id)
            : null

          const lines = groupedLines.get(groupKey) ?? []
          lines.push(textLine)
          groupedLines.set(groupKey, lines)

          // Bump project to top in sidebar
          const now = new Date().toISOString()
          for (const canViewAll of [true, false]) {
            const key = sidebarKeys.projects(workspaceId, canViewAll)
            queryClient.setQueryData(
              key,
              (old: { id: string; last_activity_at: string | null }[] | undefined) => {
                if (!old) return old
                return [...old].sort((a, b) => {
                  const aTime = a.id === msg.project_id ? now : (a.last_activity_at ?? '')
                  const bTime = b.id === msg.project_id ? now : (b.last_activity_at ?? '')
                  return bTime.localeCompare(aTime)
                })
              },
            )
          }

          const dismissGroup = () => {
            groupedLines.delete(groupKey)
            toast.dismiss(groupKey)
          }

          const goToChat = async () => {
            dismissGroup()
            if (!msg.thread_id) return

            // Загружаем данные треда для открытия боковой панели
            const { data: thread } = await supabase
              .from('project_threads')
              .select('id, name, type, project_id, workspace_id, status_id, deadline, accent_color, icon, is_pinned, created_at, created_by, sort_order')
              .eq('id', msg.thread_id)
              .single()

            if (thread) {
              const taskItem: TaskItem = {
                id: thread.id,
                name: thread.name,
                type: thread.type as 'chat' | 'task',
                project_id: thread.project_id,
                workspace_id: thread.workspace_id,
                status_id: thread.status_id,
                deadline: thread.deadline,
                accent_color: thread.accent_color,
                icon: thread.icon,
                is_pinned: thread.is_pinned,
                created_at: thread.created_at,
                created_by: thread.created_by,
                sort_order: thread.sort_order ?? 0,
                project_name: projectName,
              }
              globalOpenThread(taskItem)
            }
          }

          const doMarkAsRead = async () => {
            dismissGroup()
            const currentUser = userRef.current
            if (!currentUser) return
            const participant = await getCurrentProjectParticipant(msg.project_id, currentUser.id)
            if (!participant) return
            if (!msg.thread_id) return
            await markAsRead(participant.participantId, msg.project_id, msgChannel, msg.thread_id)
            queryClient.setQueryData(
              msg.thread_id
                ? messengerKeys.unreadCountByThreadId(msg.thread_id)
                : messengerKeys.unreadCount(msg.project_id, msgChannel),
              0,
            )
            queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
          }

          playIncomingSound()

          toast.custom(
            () =>
              buildToastContent(
                groupedLines.get(groupKey) ?? [],
                projectName,
                senderName,
                avatarUrl,
                msgChannel,
                goToChat,
                doMarkAsRead,
                dismissGroup,
                accentColor,
              ),
            {
              id: groupKey,
              duration,
              onDismiss: () => groupedLines.delete(groupKey),
              onAutoClose: () => groupedLines.delete(groupKey),
            },
          )
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId, user, queryClient])
}
