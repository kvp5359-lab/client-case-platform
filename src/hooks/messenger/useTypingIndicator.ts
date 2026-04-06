"use client"

/**
 * Хук для индикатора «печатает...» через Supabase Realtime Presence
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { MessageChannel } from '@/services/api/messenger/messengerService'

interface TypingUser {
  participantId: string
  name: string
}

export function useTypingIndicator(
  projectId: string | undefined,
  currentParticipantId: string | null,
  currentName: string | null,
  channel: MessageChannel = 'client',
  threadId?: string,
) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if ((!projectId && !threadId) || !currentParticipantId) return

    const presenceChannelName = threadId
      ? `typing:thread:${threadId}`
      : `typing:${projectId}:${channel}`

    // Удаляем старый канал с таким именем, если он ещё висит в Supabase
    // Supabase добавляет префикс "realtime:" к topic канала
    const existingChannel = supabase.getChannels().find(
      ch => ch.topic === presenceChannelName || ch.topic === `realtime:${presenceChannelName}`
    )
    if (existingChannel) {
      supabase.removeChannel(existingChannel)
    }

    const presenceChannel = supabase.channel(presenceChannelName, {
      config: { presence: { key: currentParticipantId } },
    })

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState<{ typing: boolean; name: string }>()
        const users: TypingUser[] = []

        for (const [key, presences] of Object.entries(state)) {
          if (key === currentParticipantId) continue
          const latest = presences[presences.length - 1]
          if (latest?.typing) {
            users.push({ participantId: key, name: latest.name || 'Кто-то' })
          }
        }

        setTypingUsers(users)
      })
      .subscribe()

    channelRef.current = presenceChannel

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      supabase.removeChannel(presenceChannel)
      channelRef.current = null
    }
  }, [projectId, currentParticipantId, channel, threadId])

  const startTyping = useCallback(() => {
    if (!channelRef.current || !currentParticipantId) return

    channelRef.current.track({ typing: true, name: currentName || '' })

    // Автоматически снять через 3 сек
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      channelRef.current?.track({ typing: false, name: currentName || '' })
    }, 3000)
  }, [currentParticipantId, currentName])

  const stopTyping = useCallback(() => {
    if (!channelRef.current) return
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    channelRef.current.track({ typing: false, name: currentName || '' })
  }, [currentName])

  return { typingUsers, startTyping, stopTyping }
}
