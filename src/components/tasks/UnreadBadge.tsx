"use client"

/**
 * UnreadBadge — бейдж непрочитанных сообщений задачи (из inbox-кэша).
 *
 * Подписывается на inbox-кэш через useQuery({ select }) — бейдж обновляется
 * автоматически при любом изменении inbox-данных (новое сообщение, mark as read, realtime).
 */

import { useQuery } from '@tanstack/react-query'
import { inboxKeys } from '@/hooks/queryKeys'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import { calcThreadUnread } from '@/utils/inboxUnread'

interface UnreadBadgeProps {
  threadId: string
  workspaceId: string
}

export function UnreadBadge({ threadId, workspaceId }: UnreadBadgeProps) {
  // Подписываемся на тот же ключ, что и useInboxThreadsV2. enabled: false — сам запрос
  // не делаем, только читаем кэш, который заполняет useInboxThreadsV2 в сайдбаре/inbox.
  const { data: count = 0 } = useQuery({
    queryKey: inboxKeys.threadsV2(workspaceId),
    queryFn: () => [] as InboxThreadEntry[],
    enabled: false,
    select: (threads: InboxThreadEntry[] | undefined) => {
      const entry = threads?.find((e) => e.thread_id === threadId)
      return entry ? calcThreadUnread(entry) : 0
    },
  })

  if (count <= 0) return null

  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-medium shrink-0">
      {count > 99 ? '99+' : count}
    </span>
  )
}
