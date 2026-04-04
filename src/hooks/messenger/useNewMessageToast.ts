"use client"

/**
 * Toast notifications for new messenger messages.
 * Workspace-level realtime subscription on project_messages INSERT.
 */

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { inboxKeys, messengerKeys, sidebarKeys } from '@/hooks/queryKeys'
import { getCurrentProjectParticipant, markAsRead } from '@/services/api/messengerService'
import type { InboxThread, InboxThreadEntry } from '@/services/api/inboxService'
import { buildToastContent } from './MessageToastContent'
import {
  type RealtimeMessagePayload,
  groupedLines,
  makeGroupKey,
  fetchAvatarUrl,
  parseTextLine,
} from './useMessageToastPayload'
import { playIncomingSound } from './useMessageSound'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { lsSet, LS_KEY_ACTIVE_THREAD_PREFIX } from '@/store/sidePanelStore.localStorage'

export function useNewMessageToast(workspaceId: string | undefined) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const navigateRef = useRef(navigate)
  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

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

  useEffect(() => {
    if (!workspaceId || !user) return

    const channel = supabase
      .channel(`msg-toast:${workspaceId}`)
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

          const ws = useWorkspaceStore.getState().workspace
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

          const goToChat = () => {
            dismissGroup()
            // Save chatId for target project in localStorage so it persists across navigation
            if (msg.thread_id) {
              lsSet(LS_KEY_ACTIVE_THREAD_PREFIX + msg.project_id, msg.thread_id)
              useSidePanelStore
                .getState()
                .openChat(msg.thread_id, msgChannel as 'client' | 'internal')
            }
            const chatParam = msg.thread_id ? `&chatId=${msg.thread_id}` : ''
            const messengerUrl =
              msgChannel === 'internal'
                ? `/workspaces/${workspaceId}/projects/${msg.project_id}?panel=messenger&channel=internal${chatParam}`
                : `/workspaces/${workspaceId}/projects/${msg.project_id}?panel=messenger${chatParam}`
            navigateRef.current(messengerUrl)
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
