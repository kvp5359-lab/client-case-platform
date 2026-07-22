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

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { getBadgeDisplay, type BadgeDisplay } from '@/utils/inboxUnread'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads.types'
import { acc, ACCENT_SLUGS } from '@/lib/accentPalette'
import { useInboxAggregatesCache } from '@/hooks/messenger/useInboxAggregatesCache'

// Бейдж непрочитанного = основной цвет акцента (из настраиваемой палитры).
const ACCENT_BADGE: Record<ThreadAccentColor, string> = Object.fromEntries(
  ACCENT_SLUGS.map((s) => [s, acc.bgMain(s)]),
) as Record<ThreadAccentColor, string>

type UnreadBadgeProps = {
  threadId: string
  workspaceId: string
  accentColor?: string
}

// Смешанные непрочитанные («Всем» + «Команде») — системный красный, как
// «смешанный» бейдж проекта в сайдбаре. Иначе — цвет акцента треда.
const MIXED_BADGE = acc.bgMain('rose')

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
  const data = useInboxAggregatesCache(workspaceId)

  const entry = useMemo(
    () => data?.find((e) => e.thread_id === threadId),
    [data, threadId],
  )
  const badge = useMemo<BadgeDisplay>(
    () => (entry ? getBadgeDisplay(entry) : { type: 'none' as const }),
    [entry],
  )

  if (!badge || badge.type === 'none') return null

  const badgeBg = entry?.has_mixed_unread
    ? MIXED_BADGE
    : ACCENT_BADGE[accentColor as ThreadAccentColor] ?? 'bg-primary'

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
