"use client"

/**
 * UnreadBadge — бейдж непрочитанных сообщений задачи (из inbox-кэша).
 *
 * Подписывается на inbox-кэш через useQuery({ select }) — бейдж обновляется
 * автоматически при любом изменении inbox-данных (новое сообщение, mark as read, realtime).
 */

import { useMemo, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { inboxKeys } from '@/hooks/queryKeys'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import { getBadgeDisplay, type BadgeDisplay } from '@/utils/inboxUnread'
import type { InboxInfiniteData } from '@/hooks/messenger/useInbox'

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

type UnreadBadgeProps = {
  threadId: string
  workspaceId: string
  accentColor?: string
}

function computeBadge(
  data: InboxInfiniteData | undefined,
  threadId: string,
): BadgeDisplay {
  if (!data?.pages) return { type: 'none' as const }
  for (const page of data.pages) {
    const entry = page.items.find((e: InboxThreadEntry) => e.thread_id === threadId)
    if (entry) return getBadgeDisplay(entry)
  }
  return { type: 'none' as const }
}

export function UnreadBadge({ threadId, workspaceId, accentColor }: UnreadBadgeProps) {
  // ВАЖНО: подписываемся на кэш inbox v2 БЕЗ собственного useQuery.
  // Раньше тут стоял useQuery({ queryKey, queryFn: () => [], enabled: false }) —
  // при множественных observer-ах одного queryKey React Query 5 при рефетче
  // мог использовать «пустой» queryFn от UnreadBadge вместо настоящего из
  // useInboxBase и класть в кэш [], после чего у всех тредов разом исчезали
  // бейджи. useSyncExternalStore — корректный read-only паттерн без своего
  // queryFn и без setState из subscribe (избегаем «Cannot update a component
  // while rendering a different component»: getSnapshot возвращает стабильную
  // ссылку на массив тредов, badge выводим через useMemo в render-фазе).
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => inboxKeys.threads(workspaceId), [workspaceId])

  const data = useSyncExternalStore<InboxInfiniteData | undefined>(
    (onChange) => {
      const cache = queryClient.getQueryCache()
      return cache.subscribe((event) => {
        const evKey = event.query.queryKey
        if (
          !Array.isArray(evKey) ||
          evKey.length !== queryKey.length ||
          evKey[0] !== queryKey[0] ||
          evKey[1] !== queryKey[1] ||
          evKey[2] !== queryKey[2]
        ) {
          return
        }
        onChange()
      })
    },
    () => queryClient.getQueryData<InboxInfiniteData>(queryKey),
    () => undefined,
  )

  const badge = useMemo<BadgeDisplay>(() => computeBadge(data, threadId), [data, threadId])

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
