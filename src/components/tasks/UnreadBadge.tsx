"use client"

/**
 * UnreadBadge — бейдж непрочитанных сообщений задачи.
 *
 * ⚠️ Источник — ПОЛНЫЙ кэш агрегатов `inboxKeys.aggregates` (RPC
 * `get_inbox_thread_aggregates`, без пагинации), а НЕ пагинированный
 * `inboxKeys.threads` (он держит только первую страницу инбокса ~50 тредов).
 * Раньше читали threads → у задачи со 2-й+ страницы инбокса бейдж пропадал,
 * хотя непрочитанные есть. Агрегаты наполняет сайдбар на каждой странице
 * (`useSidebarInboxCounts`) и realtime их инвалидирует → бейдж обновляется сам.
 *
 * Подписка через useSyncExternalStore (read-only, без своего queryFn): при
 * множественных observer-ах одного queryKey React Query мог использовать
 * «пустой» queryFn и класть [] в кэш — тогда у всех тредов разом исчезали бейджи.
 */

import { useMemo, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { inboxKeys } from '@/hooks/queryKeys'
import type { InboxThreadAggregate } from '@/services/api/inboxService'
import { getBadgeDisplay, type BadgeDisplay } from '@/utils/inboxUnread'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads.types'
import { acc, ACCENT_SLUGS } from '@/lib/accentPalette'

// Бейдж непрочитанного = основной цвет акцента (из настраиваемой палитры).
const ACCENT_BADGE: Record<ThreadAccentColor, string> = Object.fromEntries(
  ACCENT_SLUGS.map((s) => [s, acc.bgMain(s)]),
) as Record<ThreadAccentColor, string>

type UnreadBadgeProps = {
  threadId: string
  workspaceId: string
  accentColor?: string
}

function computeBadge(
  data: InboxThreadAggregate[] | undefined,
  threadId: string,
): BadgeDisplay {
  if (!data) return { type: 'none' as const }
  const entry = data.find((e) => e.thread_id === threadId)
  return entry ? getBadgeDisplay(entry) : { type: 'none' as const }
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
  const queryKey = useMemo(() => inboxKeys.aggregates(workspaceId), [workspaceId])

  const data = useSyncExternalStore<InboxThreadAggregate[] | undefined>(
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
    () => queryClient.getQueryData<InboxThreadAggregate[]>(queryKey),
    () => undefined,
  )

  const badge = useMemo<BadgeDisplay>(() => computeBadge(data, threadId), [data, threadId])

  if (!badge || badge.type === 'none') return null

  const badgeBg = ACCENT_BADGE[accentColor as ThreadAccentColor] ?? 'bg-primary'

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
