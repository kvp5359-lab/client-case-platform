"use client"

/**
 * UnreadBadge — бейдж непрочитанных сообщений задачи (из inbox-кэша).
 *
 * Подписывается на inbox-кэш через useQuery({ select }) — бейдж обновляется
 * автоматически при любом изменении inbox-данных (новое сообщение, mark as read, realtime).
 */

import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { inboxKeys } from '@/hooks/queryKeys'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import { getBadgeDisplay } from '@/utils/inboxUnread'

const ACCENT_BADGE: Record<string, string> = {
  blue: 'bg-blue-500',
  slate: 'bg-stone-600',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
  orange: 'bg-orange-500',
  cyan: 'bg-cyan-500',
  pink: 'bg-pink-500',
  indigo: 'bg-indigo-500',
}

interface UnreadBadgeProps {
  threadId: string
  workspaceId: string
  accentColor?: string
}

export function UnreadBadge({ threadId, workspaceId, accentColor }: UnreadBadgeProps) {
  const { data: badge } = useQuery({
    queryKey: inboxKeys.threadsV2(workspaceId),
    queryFn: () => [] as InboxThreadEntry[],
    enabled: false,
    select: (threads: InboxThreadEntry[] | undefined) => {
      const entry = threads?.find((e) => e.thread_id === threadId)
      return entry ? getBadgeDisplay(entry) : { type: 'none' as const }
    },
  })

  if (!badge || badge.type === 'none') return null

  const badgeBg = ACCENT_BADGE[accentColor ?? ''] ?? 'bg-primary'

  if (badge.type === 'dot') {
    return (
      <span className={cn('inline-block w-[18px] h-[18px] rounded-full shrink-0', badgeBg)} />
    )
  }

  if (badge.type === 'emoji') {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center w-[18px] h-[18px] rounded-full shrink-0',
          badgeBg,
        )}
      >
        <span className="text-[10px] leading-none">{badge.value}</span>
      </span>
    )
  }

  return (
    <span className={cn('inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-white text-[11px] font-medium shrink-0', badgeBg)}>
      {badge.value > 99 ? '99+' : badge.value}
    </span>
  )
}
