"use client"

/**
 * Хук для загрузки полных сообщений из нескольких тредов для timeline.
 * Возвращает ProjectMessage[] с реакциями, вложениями, цитатами — всё как в мессенджере.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import { timelineKeys, STALE_TIME } from '@/hooks/queryKeys'

/** Тот же SELECT что и в messengerService — полные данные сообщения */
const FULL_MESSAGE_SELECT = `
  *,
  sender:participants!sender_participant_id(avatar_url),
  reactions:message_reactions(*, participant:participants!participant_id(name, last_name, avatar_url)),
  attachments:message_attachments(*)
`

/** Сообщение, обогащённое информацией о треде */
export interface TimelineMessageEntry {
  message: ProjectMessage
  thread: {
    id: string
    name: string
    accent_color: string
    icon: string
  }
  /** user_id отправителя (для определения isOwn) */
  senderUserId: string | null
}

export function useTimelineMessages(
  projectId: string,
  threadIds: string[],
  threads: ProjectThread[],
) {
  return useQuery({
    queryKey: timelineKeys.messages(projectId, threadIds),
    queryFn: async (): Promise<TimelineMessageEntry[]> => {
      if (threadIds.length === 0) return []

      const { data, error } = await supabase
        .from('project_messages')
        .select(FULL_MESSAGE_SELECT)
        .eq('project_id', projectId)
        .in('thread_id', threadIds)
        .eq('is_draft', false)
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) throw error

      const rows = (data ?? []) as unknown as ProjectMessage[]
      const threadMap = new Map(threads.map((t) => [t.id, t]))

      // Собираем id для hydrate — параллельно запрашиваем replies и participants.
      // Раньше эти два запроса выполнялись последовательно, добавляя ~100-200мс к загрузке.
      const replyIds = [
        ...new Set(rows.map((m) => m.reply_to_message_id).filter(Boolean) as string[]),
      ]
      const participantIds = [
        ...new Set(rows.map((m) => m.sender_participant_id).filter(Boolean) as string[]),
      ]

      const [repliesResult, participantsResult] = await Promise.all([
        replyIds.length > 0
          ? supabase
              .from('project_messages')
              .select('id, content, sender_name')
              .in('id', replyIds)
          : Promise.resolve({ data: null }),
        participantIds.length > 0
          ? supabase.from('participants').select('id, user_id').in('id', participantIds)
          : Promise.resolve({ data: null }),
      ])

      // Hydrate reply_to_message
      if (repliesResult.data) {
        const replyMap = new Map(
          repliesResult.data.map((r) => [
            r.id,
            { id: r.id, content: r.content, sender_name: r.sender_name },
          ]),
        )
        for (const msg of rows) {
          msg.reply_to_message = msg.reply_to_message_id
            ? (replyMap.get(msg.reply_to_message_id) ?? null)
            : null
        }
      }

      // Resolve sender user_id for isOwn detection
      const userIdMap = new Map<string, string>()
      if (participantsResult.data) {
        for (const p of participantsResult.data) {
          if (p.user_id) userIdMap.set(p.id, p.user_id)
        }
      }

      return rows.map((msg) => {
        const thread = threadMap.get(msg.thread_id ?? '')
        return {
          message: msg,
          thread: {
            id: thread?.id ?? msg.thread_id ?? '',
            name: thread?.name ?? 'Чат',
            accent_color: thread?.accent_color ?? 'blue',
            icon: thread?.icon ?? 'message-square',
          },
          senderUserId: msg.sender_participant_id
            ? (userIdMap.get(msg.sender_participant_id) ?? null)
            : null,
        }
      })
    },
    enabled: !!projectId && threadIds.length > 0,
    staleTime: STALE_TIME.SHORT,
  })
}
