import type { InboxThreadEntry } from '@/services/api/inboxService'

/**
 * Определяет, что показать в строке «Входящих»: какое действие новее (реакция
 * > событие > сообщение), какое время и чью аватарку/имя рисовать в левом слоте.
 *
 * Чистая функция — вынесена из InboxChatItem.tsx (аудит 2026-07-13) ради
 * тестируемости; логика выбора не менялась.
 *
 * Правила аватара: непрочитанная реакция новее → реагировавший; многоучастниковый
 * тред (задача/TG-группа) → автор показанного действия; иначе собеседник
 * (counterpart), а для email без собеседника — инициал по email_contact.
 */
export type InboxPreview = {
  reactionIsNewer: boolean
  eventIsNewer: boolean
  displayTime: string | null
  /** Имя автора события (из начала last_event_text «Имя · …»), иначе null. */
  eventActorName: string | null
  avatarUrl: string | null
  avatarFallbackName: string | null
}

export function resolveInboxPreview(chat: InboxThreadEntry): InboxPreview {
  // Determine latest activity: reaction (unread only) > audit event > message.
  const reactionIsNewer =
    chat.has_unread_reaction &&
    !!chat.last_reaction_at &&
    (!chat.last_message_at || chat.last_reaction_at > chat.last_message_at) &&
    (!chat.last_event_at || chat.last_reaction_at > chat.last_event_at)

  const eventIsNewer =
    !reactionIsNewer &&
    !!chat.last_event_at &&
    (!chat.last_message_at || chat.last_event_at > chat.last_message_at)

  const displayTime = reactionIsNewer
    ? chat.last_reaction_at
    : eventIsNewer
      ? chat.last_event_at
      : chat.last_message_at

  const hasCounterpart = !!chat.counterpart_name
  const isEmailWithoutCounterpart =
    !hasCounterpart && chat.channel_type === 'email' && !!chat.email_contact
  // Многоучастниковый тред: единого «собеседника» нет → аватар = автор действия.
  const isMultiParticipant = chat.thread_type === 'task' || chat.channel_type === 'telegram'
  const eventActorName =
    eventIsNewer && chat.last_event_text?.includes(' · ')
      ? chat.last_event_text.split(' · ')[0]
      : null

  let avatarUrl: string | null
  let avatarFallbackName: string | null
  if (reactionIsNewer) {
    avatarUrl = chat.last_reaction_sender_avatar_url
    avatarFallbackName = chat.last_reaction_sender_name
  } else if (isMultiParticipant) {
    avatarUrl = eventIsNewer ? chat.last_event_sender_avatar_url : chat.last_sender_avatar_url
    avatarFallbackName = eventIsNewer
      ? eventActorName ?? chat.last_sender_name
      : chat.last_sender_name
  } else if (hasCounterpart) {
    avatarUrl = chat.counterpart_avatar_url
    avatarFallbackName = chat.counterpart_name
  } else if (isEmailWithoutCounterpart) {
    avatarUrl = null
    avatarFallbackName = chat.email_contact
  } else {
    avatarUrl = chat.last_sender_avatar_url
    avatarFallbackName = chat.last_sender_name
  }

  return { reactionIsNewer, eventIsNewer, displayTime, eventActorName, avatarUrl, avatarFallbackName }
}
