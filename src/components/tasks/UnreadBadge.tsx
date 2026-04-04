"use client"

/**
 * UnreadBadge — бейдж непрочитанных сообщений задачи (из inbox-кэша).
 */

import { useQueryClient } from '@tanstack/react-query'
import { inboxKeys } from '@/hooks/queryKeys'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import { calcThreadUnread } from '@/utils/inboxUnread'

interface UnreadBadgeProps {
  threadId: string
  workspaceId: string
}

export function UnreadBadge({ threadId, workspaceId }: UnreadBadgeProps) {
  const queryClient = useQueryClient()
  const inboxEntries = queryClient.getQueryData<InboxThreadEntry[]>(
    inboxKeys.threadsV2(workspaceId),
  )

  const entry = inboxEntries?.find((e) => e.thread_id === threadId)
  const count = entry ? calcThreadUnread(entry) : 0

  if (count <= 0) return null

  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-medium shrink-0">
      {count > 99 ? '99+' : count}
    </span>
  )
}
