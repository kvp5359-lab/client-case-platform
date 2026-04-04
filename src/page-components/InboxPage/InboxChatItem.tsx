import { memo } from 'react'
import { MessageSquare, Send, Mail, EyeOff, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { stripHtml } from '@/utils/messengerHtml'
import type { InboxThreadEntry, InboxChannelType } from '@/services/api/inboxService'
import { calcThreadUnread } from '@/utils/inboxUnread'
import { formatShortDate } from '@/utils/dateFormat'

function formatTime(isoString: string | null): string {
  if (!isoString) return ''
  const date = new Date(isoString)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return 'вчера'
  }
  return formatShortDate(isoString)
}

function truncateText(text: string | null, maxLen = 50): string {
  if (!text) return ''
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}

/** Цвета фона и текста иконки по accent_color чата */
const accentStyles: Record<string, { bg: string; text: string; badge: string; ring: string }> = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-600', badge: 'bg-blue-500', ring: 'ring-blue-400' },
  slate: {
    bg: 'bg-stone-100',
    text: 'text-stone-600',
    badge: 'bg-stone-600',
    ring: 'ring-stone-400',
  },
  emerald: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-600',
    badge: 'bg-emerald-500',
    ring: 'ring-emerald-400',
  },
  amber: {
    bg: 'bg-amber-100',
    text: 'text-amber-600',
    badge: 'bg-amber-500',
    ring: 'ring-amber-400',
  },
  rose: { bg: 'bg-rose-100', text: 'text-rose-600', badge: 'bg-rose-500', ring: 'ring-rose-400' },
  violet: {
    bg: 'bg-violet-100',
    text: 'text-violet-600',
    badge: 'bg-violet-500',
    ring: 'ring-violet-400',
  },
  orange: {
    bg: 'bg-orange-100',
    text: 'text-orange-600',
    badge: 'bg-orange-500',
    ring: 'ring-orange-400',
  },
  cyan: { bg: 'bg-cyan-100', text: 'text-cyan-600', badge: 'bg-cyan-500', ring: 'ring-cyan-400' },
  pink: { bg: 'bg-pink-100', text: 'text-pink-600', badge: 'bg-pink-500', ring: 'ring-pink-400' },
  indigo: {
    bg: 'bg-indigo-100',
    text: 'text-indigo-600',
    badge: 'bg-indigo-500',
    ring: 'ring-indigo-400',
  },
}

const defaultAccent = accentStyles.blue

/** Иконка типа канала (маленькая, в углу аватара) */
const channelIcons: Record<InboxChannelType, typeof Send> = {
  telegram: Send,
  email: Mail,
  web: MessageSquare,
}

interface InboxChatItemProps {
  chat: InboxThreadEntry
  isSelected: boolean
  onClick: () => void
  onMarkAsUnread?: () => void
  onMarkAsRead?: () => void
  /** Скрыть название проекта (для контекста внутри проекта) */
  hideProjectName?: boolean
}

export const InboxChatItem = memo(function InboxChatItem({
  chat,
  isSelected,
  onClick,
  onMarkAsUnread,
  onMarkAsRead,
  hideProjectName,
}: InboxChatItemProps) {
  // Черновик из localStorage
  const draftHtml = localStorage.getItem(`msg_draft:${chat.project_id}:${chat.thread_id}`)
  const draftText = draftHtml ? stripHtml(draftHtml).trim() || null : null

  const hasUnread = chat.unread_count > 0 || chat.has_unread_reaction
  const hasUnreadIndicator = hasUnread || chat.manually_unread

  const accent = accentStyles[chat.thread_accent_color] ?? defaultAccent
  const ChannelIcon = channelIcons[chat.channel_type]

  return (
    <button
      onClick={onClick}
      className={cn(
        'group/chat w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
        isSelected
          ? 'bg-blue-100'
          : hasUnreadIndicator
            ? 'bg-white hover:bg-gray-50'
            : 'hover:bg-gray-50',
      )}
    >
      {/* Аватар последнего отправителя с цветной обводкой */}
      <div className="relative shrink-0 mt-0.5">
        {chat.last_sender_avatar_url ? (
          <img
            src={chat.last_sender_avatar_url}
            alt={chat.last_sender_name ?? ''}
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
            {(chat.last_sender_name ?? chat.thread_name).charAt(0).toUpperCase()}
          </div>
        )}
        {/* Бейдж типа канала */}
        {chat.channel_type !== 'web' && (
          <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-white flex items-center justify-center">
            <ChannelIcon className="h-3 w-3 text-gray-500" />
          </div>
        )}
      </div>

      {/* Контент */}
      <div className="flex-1 min-w-0">
        {/* Строка 1: проект (чат) + время */}
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-sm truncate">
            <span
              className={cn(
                hasUnreadIndicator ? 'font-semibold text-gray-900' : 'font-medium text-gray-700',
              )}
            >
              {hideProjectName ? chat.thread_name : chat.project_name}
            </span>
            {!hideProjectName && (
              <span className="text-gray-400 font-normal"> ({chat.thread_name})</span>
            )}
          </span>
          <span className="text-[11px] text-gray-400 shrink-0 ml-2">
            {formatTime(chat.last_message_at)}
          </span>
        </div>
        {/* Строка 2: проект · последнее сообщение + бейдж */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400 truncate">
            {draftText ? (
              <>
                <span className="text-red-500 font-medium">Черновик: </span>
                <span className="text-gray-500">{truncateText(draftText, 40)}</span>
              </>
            ) : chat.last_message_text ? (
              <>
                {chat.last_sender_name && (
                  <span className="font-semibold text-gray-900">{chat.last_sender_name}: </span>
                )}
                {truncateText(stripHtml(chat.last_message_text))}
              </>
            ) : (
              <span className="text-gray-400">Нет сообщений</span>
            )}
          </p>
          {/* Индикатор непрочитанности */}
          {hasUnread ? (
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
              {chat.has_unread_reaction && chat.unread_count === 0 ? (
                <span
                  className={cn(
                    'h-5 w-5 rounded-full flex items-center justify-center text-[11px] leading-none group-hover/badge:hidden',
                    accent.badge,
                  )}
                >
                  {chat.last_reaction_emoji}
                </span>
              ) : (
                <span
                  className={cn(
                    'h-5 min-w-5 text-[10px] px-1.5 rounded-full group-hover/badge:hidden text-white font-medium flex items-center justify-center leading-none',
                    accent.badge,
                  )}
                >
                  {calcThreadUnread(chat) > 99 ? '99+' : calcThreadUnread(chat)}
                </span>
              )}
              <span className="hidden group-hover/badge:flex w-5 h-5 items-center justify-center rounded-full bg-blue-100">
                <CheckCheck className="h-3.5 w-3.5 text-blue-500" />
              </span>
            </div>
          ) : chat.manually_unread ? (
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
              <span
                className={cn('h-5 min-w-5 rounded-full group-hover/badge:hidden', accent.badge)}
              />
              <span className="hidden group-hover/badge:flex w-5 h-5 items-center justify-center rounded-full bg-blue-100">
                <CheckCheck className="h-3.5 w-3.5 text-blue-500" />
              </span>
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
    </button>
  )
})
