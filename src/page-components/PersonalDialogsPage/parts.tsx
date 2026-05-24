"use client"

/**
 * Вспомогательные единицы для PersonalDialogsPage:
 * - CHANNEL_LABELS — карта меток каналов
 * - toInboxEntry — адаптер PersonalDialogEntry → InboxThreadEntry
 * - ChannelChip — chip-кнопка фильтра по каналу
 */

import { cn } from '@/lib/utils'
import type { PersonalDialogChannel, PersonalDialogEntry } from '@/services/api/personalDialogsService'
import type { InboxThreadEntry } from '@/services/api/inboxService'

export const CHANNEL_LABELS: Record<PersonalDialogChannel, string> = {
  telegram_business: 'Telegram',
  telegram_mtproto: 'Telegram',
  wazzup: 'WhatsApp',
  email: 'Email',
  other: 'Другие',
}

/** Адаптер PersonalDialogEntry → InboxThreadEntry для переиспользования InboxChatItem. */
export function toInboxEntry(d: PersonalDialogEntry): InboxThreadEntry {
  const channelType: 'web' | 'telegram' | 'email' =
    d.channel === 'email'
      ? 'email'
      : d.channel === 'telegram_business' || d.channel === 'telegram_mtproto'
        ? 'telegram'
        : 'web'
  return {
    thread_id: d.thread_id,
    thread_name: d.thread_name,
    thread_icon: d.thread_icon,
    thread_accent_color: d.thread_accent_color,
    thread_type: d.thread_type === 'task' ? 'task' : 'chat',
    project_id: d.project_id,
    project_name: d.project_name,
    channel_type: channelType,
    legacy_channel: d.legacy_channel,
    last_message_at: d.last_message_at,
    last_message_text: d.last_message_text,
    last_message_attachment_name: d.last_message_attachment_name,
    last_message_attachment_count: d.last_message_attachment_count,
    last_sender_name: d.last_sender_name,
    last_sender_avatar_url: d.last_sender_avatar_url,
    unread_count: d.unread_count,
    manually_unread: d.manually_unread,
    has_unread_reaction: false,
    unread_reaction_count: 0,
    last_reaction_emoji: null,
    last_reaction_at: null,
    last_reaction_sender_name: null,
    last_reaction_sender_avatar_url: null,
    last_reaction_message_preview: null,
    email_contact: d.email_contact,
    email_subject: d.email_subject,
    last_event_at: null,
    last_event_text: null,
    last_event_status_color: null,
    unread_event_count: 0,
    // PersonalDialogEntry не несёт «собеседника» отдельно — у личных диалогов
    // он совпадает с last_sender (внешний контакт), InboxChatItem умеет
    // fallback на last_sender_name/avatar когда counterpart_* пустые.
    counterpart_name: null,
    counterpart_avatar_url: null,
    // PersonalDialogEntry не отдельно несёт last_read_at; PersonalDialogsPage
    // не отображает красные контуры непрочитанных у бабблов в этом списке
    // (он чисто навигационный → клик открывает тред). null = «не открывалось».
    last_read_at: null,
  }
}

type ChannelChipProps = {
  active: boolean
  label: string
  count: number
  onClick: () => void
}

export function ChannelChip({ active, label, count, onClick }: ChannelChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-xs px-2.5 py-1 rounded-full transition-colors flex items-center gap-1',
        active
          ? 'bg-blue-100 text-blue-700 font-medium'
          : 'text-gray-500 hover:bg-gray-100',
      )}
    >
      {label}
      <span
        className={cn(
          'min-w-[16px] h-4 px-1 rounded-full text-[10px] font-medium flex items-center justify-center',
          active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600',
        )}
      >
        {count}
      </span>
    </button>
  )
}
