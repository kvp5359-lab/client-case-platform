import { memo } from 'react'
import Image from 'next/image'
import { EyeOff, CheckCheck, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { stripHtml } from '@/utils/format/messengerHtml'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { DeliveryStatus } from './DeliveryIndicator'
import { getBadgeDisplay, formatBadgeCount } from '@/utils/inboxUnread'
import { usePrefetchThreadMessages } from '@/hooks/messenger/usePrefetchThreadMessages'
import {
  accentStyles,
  defaultAccent,
  formatTime,
  DeliveryTick,
  iconByThreadIcon,
  channelIcons,
} from './inboxChatItem.helpers'
import { resolveInboxPreview } from './resolveInboxPreview'
import { InboxItemPreview } from './InboxItemPreview'
import { useThreadNameResolver } from '@/hooks/useThreadUserNames'
import { threadHref, entityLinkClickHandlers } from '@/lib/entityLinks'
import { useThreadMixedUnread } from '@/hooks/messenger/useInboxAggregatesCache'
import { acc } from '@/lib/accentPalette'

// Смешанные непрочитанные («Всем» + «Команде») — системный красный, тот же
// `rose`, что у «смешанного» бейджа проекта в сайдбаре.
const MIXED_BADGE = acc.bgMain('rose')

type InboxChatItemProps = {
  chat: InboxThreadEntry
  isSelected: boolean
  onClick: () => void
  onMarkAsUnread?: () => void
  onMarkAsRead?: () => void
  /** Скрыть название проекта (для контекста внутри проекта) */
  hideProjectName?: boolean
  /** Статус доставки последнего исходящего сообщения (для галочки в превью). */
  deliveryStatus?: DeliveryStatus
  /** Имя текущего пользователя (в формате `last_sender_name` из RPC). Если автор
   *  последнего сообщения/реакции совпал — в превью показываем «Я» вместо имени. */
  selfSenderName?: string | null
  /** Тред заглушён (вкладка «Заглушённые») — бейдж непрочитанного светло-серый
   *  (как архив в Telegram), а не в акцент треда. */
  mutedBadge?: boolean
  /** Воркспейс — для href строки (средний клик / Cmd+клик открывают тред в новой
   *  вкладке). Без него строка остаётся кликабельной, но не ссылкой. */
  workspaceId?: string
}

export const InboxChatItem = memo(function InboxChatItem({
  chat,
  isSelected,
  onClick,
  onMarkAsUnread,
  onMarkAsRead,
  hideProjectName,
  deliveryStatus,
  selfSenderName,
  mutedBadge = false,
  workspaceId,
}: InboxChatItemProps) {
  const prefetchMessages = usePrefetchThreadMessages()
  const resolveThreadName = useThreadNameResolver()
  const displayThreadName = resolveThreadName(chat.thread_id, chat.thread_name)
  // Флага нет в строке инбокса (v3_for его не несёт) — берём из кэша агрегатов.
  const mixedUnread = useThreadMixedUnread(workspaceId, chat.thread_id)

  // Черновик из localStorage
  const draftHtml = localStorage.getItem(`msg_draft:${chat.project_id}:${chat.thread_id}`)
  const draftText = draftHtml ? stripHtml(draftHtml).trim() || null : null

  const badge = getBadgeDisplay(chat)
  const hasUnreadIndicator = badge.type !== 'none'

  // Какое действие новее (реакция > событие > сообщение), время, аватар/имя слота.
  const { reactionIsNewer, eventIsNewer, displayTime, avatarUrl, avatarFallbackName } =
    resolveInboxPreview(chat)

  // Галочка доставки — только когда превью показывает само сообщение (не черновик,
  // не реакцию, не событие) и оно исходящее (deliveryStatus задан сервером).
  const showDelivery = !!deliveryStatus && !draftText && !reactionIsNewer && !eventIsNewer

  const accent = accentStyles[chat.thread_accent_color] ?? defaultAccent
  // Бейдж: заглушённый тред — светло-серый (архив Telegram); смешанные
  // непрочитанные («Всем» + «Команде») — системный красный (как «смешанный»
  // бейдж проекта в сайдбаре); иначе — цвет акцента треда.
  // Флаг живёт в агрегатах (v3_for его намеренно не несёт — см. миграцию).
  const badgeBg = mutedBadge
    ? 'bg-gray-400'
    : mixedUnread
      ? MIXED_BADGE
      : accent.badge
  const badgeText = 'text-white'
  // Значок канала на аватаре (по thread_icon, иначе по каналу); цвет = акцент треда.
  const ChannelIcon = iconByThreadIcon[chat.thread_icon] ?? channelIcons[chat.channel_type] ?? MessageSquare
  const channelColor = accent.text

  // Рендерим <a href> вместо <button>: средний клик / Cmd+клик открывают тред в
  // новой вкладке нативно. Обычный левый клик гасим и открываем в панели (SPA).
  // href без workspaceId НЕ подставляем: '#' сделал бы средний клик открытием
  // бесполезной вкладки текущей страницы, а без атрибута это просто не ссылка.
  const href = workspaceId ? threadHref(workspaceId, chat.thread_id, chat.project_id) : undefined

  return (
    <a
      href={href}
      {...entityLinkClickHandlers(onClick)}
      onMouseEnter={() => prefetchMessages(chat.thread_id, chat.project_id)}
      className={cn(
        'group/chat w-full flex items-start gap-3 px-4 py-3 text-left transition-colors no-underline text-inherit',
        isSelected
          ? 'bg-blue-100'
          : hasUnreadIndicator
            ? 'bg-white hover:bg-gray-50'
            : 'hover:bg-gray-50',
      )}
    >
      {/* Аватар последнего отправителя (или автора реакции, если она новее) */}
      <div className="relative shrink-0 mt-0.5">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={avatarFallbackName ?? ''}
            width={40}
            height={40}
            className={cn('w-10 h-10 rounded-full object-cover ring-2', accent.ring)}
          />
        ) : (
          <div
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center ring-2 text-sm font-medium',
              accent.bg,
              accent.text,
              accent.ring,
            )}
          >
            {(avatarFallbackName ?? displayThreadName).charAt(0).toUpperCase()}
          </div>
        )}
        {/* Значок в углу аватара: канал (в цвет акцента) или иконка треда */}
        <div className="absolute -top-0.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center">
          <ChannelIcon className={cn('h-3 w-3', channelColor)} />
        </div>
      </div>

      {/* Контент */}
      <div className="flex-1 min-w-0">
        {/* Строка 1: тред · проект + время. Тред первым (он есть всегда), проект —
            после через «·» (может не быть). Тред ужимается (min-w-0), проект —
            плашка shrink-0 max-w-[50%] truncate. */}
        <div className="flex items-center justify-between mb-0.5 gap-2">
          <span className="flex flex-1 items-center gap-1 min-w-0 text-sm">
            <span
              className={cn(
                'truncate min-w-0',
                hasUnreadIndicator ? 'font-semibold text-gray-900' : 'font-medium text-gray-700',
              )}
            >
              {displayThreadName}
            </span>
            {!hideProjectName && chat.project_name && (
              <span className="truncate shrink-0 max-w-[50%] rounded bg-[#e6ebf2] px-1.5 py-0 text-[12px] leading-[18px] font-medium text-gray-700">
                {chat.project_name}
              </span>
            )}
          </span>
          <span className="text-[11px] text-gray-400 shrink-0">{formatTime(displayTime)}</span>
        </div>
        {/* Строка 2: превью последнего действия + бейдж */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400 truncate">
            <InboxItemPreview
              chat={chat}
              draftText={draftText}
              accentText={accent.text}
              selfSenderName={selfSenderName}
              reactionIsNewer={reactionIsNewer}
              eventIsNewer={eventIsNewer}
            />
          </p>
          {/* Индикатор непрочитанности — единая логика из getBadgeDisplay */}
          {badge.type !== 'none' ? (
            <div
              role="button"
              tabIndex={0}
              title="Прочитано"
              className="group/badge ml-2 shrink-0 flex items-center justify-center w-5 h-5 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                onMarkAsRead?.()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  onMarkAsRead?.()
                }
              }}
            >
              {badge.type === 'number' && (
                <span
                  className={cn(
                    'h-5 min-w-5 text-[10px] px-1.5 rounded-full group-hover/badge:hidden font-medium flex items-center justify-center leading-none',
                    badgeText,
                    badgeBg,
                  )}
                >
                  {formatBadgeCount(badge.value)}
                </span>
              )}
              {badge.type === 'emoji' && (
                <span
                  className={cn(
                    'h-5 w-5 rounded-full flex items-center justify-center text-[11px] leading-none group-hover/badge:hidden',
                    badgeBg,
                  )}
                >
                  {badge.value}
                </span>
              )}
              {badge.type === 'dot' && (
                <span
                  className={cn('h-5 min-w-5 rounded-full group-hover/badge:hidden', badgeBg)}
                />
              )}
              <span className="hidden group-hover/badge:flex w-5 h-5 items-center justify-center rounded-full bg-blue-100">
                <CheckCheck className="h-3.5 w-3.5 text-blue-500" />
              </span>
            </div>
          ) : showDelivery && deliveryStatus ? (
            // Последнее сообщение наше — галочка доставки на месте бейджа.
            // На ховере строки галочка уступает кнопке «отметить непрочитанным».
            <div className="ml-2 shrink-0 flex items-center justify-center w-5 h-5">
              <span className={cn(onMarkAsUnread && 'group-hover/chat:hidden')}>
                <DeliveryTick status={deliveryStatus} />
              </span>
              {onMarkAsUnread && (
                <div
                  role="button"
                  tabIndex={0}
                  title="Непрочитанное"
                  className="hidden group-hover/chat:flex w-5 h-5 items-center justify-center cursor-pointer rounded-full hover:bg-gray-200"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMarkAsUnread()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
                      onMarkAsUnread()
                    }
                  }}
                >
                  <EyeOff className="h-3.5 w-3.5 text-gray-400" />
                </div>
              )}
            </div>
          ) : (
            onMarkAsUnread && (
              <div
                role="button"
                tabIndex={0}
                title="Непрочитанное"
                className="ml-2 shrink-0 flex items-center justify-center w-5 h-5 opacity-0 group-hover/chat:opacity-100 transition-opacity cursor-pointer rounded-full hover:bg-gray-200"
                onClick={(e) => {
                  e.stopPropagation()
                  onMarkAsUnread()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    onMarkAsUnread()
                  }
                }}
              >
                <EyeOff className="h-3.5 w-3.5 text-gray-400" />
              </div>
            )
          )}
        </div>
      </div>
    </a>
  )
})
