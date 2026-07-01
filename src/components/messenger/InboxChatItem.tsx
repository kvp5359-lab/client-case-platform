import { memo } from 'react'
import Image from 'next/image'
import { MessageSquare, Send, Mail, EyeOff, Check, CheckCheck, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { stripHtml, stripHtmlIgnoreQuotes } from '@/utils/format/messengerHtml'
import type { InboxThreadEntry, InboxChannelType } from '@/services/api/inboxService'
import type { DeliveryStatus } from './DeliveryIndicator'
import { getBadgeDisplay, formatBadgeCount } from '@/utils/inboxUnread'
import { formatShortDate } from '@/utils/format/dateFormat'
import { safeCssColor } from '@/utils/isValidCssColor'
import { usePrefetchThreadMessages } from '@/hooks/messenger/usePrefetchThreadMessages'
import { THREAD_ICONS } from './threadConstants'
import { acc, ACCENT_SLUGS } from '@/lib/accentPalette'

const STATUS_PREFIX = 'Статус: '

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

/**
 * Telegram-бот сохраняет в `content` эмодзи-плейсхолдеры («📎», «🖼», «🎤»…)
 * для сообщений без текста но с вложением. В превью такое имя файла полезнее
 * самой эмодзи: `📎` превращается в `Brief_Bogdanov.docx`.
 */
function isAttachmentPlaceholderText(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length === 0) return true
  // 1–2 юникод-code-unit'а, не содержащие ни букв, ни цифр, ни типичной пунктуации
  // = эмодзи-плейсхолдер. Нормальные подписи длиннее или содержат буквы.
  if (trimmed.length > 4) return false
  return !/[\p{L}\p{N}]/u.test(trimmed)
}

/**
 * Превью медиа-вложения для inbox-строки. Используется когда у последнего
 * сообщения нет осмысленного текста (пустой / плейсхолдер).
 *
 * `audio/ogg` (Telegram/WA voice) → отдельно «Голосовое сообщение», иначе
 * группируем по верхнему уровню mime. Если mime неизвестен — fallback на
 * имя файла, иначе нейтральное «Вложение».
 */
function getMediaPreview(
  mime: string | null,
  fileName: string | null,
): { emoji: string; label: string } {
  if (mime === 'audio/ogg') return { emoji: '🎤', label: 'Голосовое сообщение' }
  if (mime?.startsWith('audio/')) return { emoji: '🎵', label: 'Аудио' }
  if (mime?.startsWith('image/')) return { emoji: '🖼', label: 'Изображение' }
  if (mime?.startsWith('video/')) return { emoji: '🎬', label: 'Видео' }
  if (fileName) return { emoji: '📎', label: fileName }
  return { emoji: '📎', label: 'Вложение' }
}

/** Цвета фона и текста иконки по accent_color чата (из настраиваемой палитры) */
const accentStyles: Record<string, { bg: string; text: string; badge: string; ring: string }> =
  Object.fromEntries(
    ACCENT_SLUGS.map((s) => [
      s,
      { bg: acc.bgLight(s), text: acc.textMain(s), badge: acc.bgMain(s), ring: acc.ringMain(s) },
    ]),
  )

const defaultAccent = accentStyles.blue

/**
 * Галочка статуса доставки последнего ИСХОДЯЩЕГО сообщения в превью списка.
 * Как в самих сообщениях: «отправлено» — одна серая, «прочитано» — две синие.
 * `failed` в превью не рисуем (ошибка видна в треде + тосте). Цвета — под белый фон.
 */
function DeliveryTick({ status }: { status: DeliveryStatus }) {
  if (status === 'pending') return <Clock className="h-3 w-3 shrink-0 text-gray-400" aria-label="Отправляется" />
  if (status === 'read') return <CheckCheck className="h-3 w-3 shrink-0 text-blue-500" aria-label="Прочитано" />
  if (status === 'sent') return <Check className="h-3 w-3 shrink-0 text-gray-400" aria-label="Отправлено" />
  return null
}

/** Иконка типа канала (маленькая, в углу аватара) */
const channelIcons: Record<InboxChannelType, typeof Send> = {
  telegram: Send,
  email: Mail,
  web: MessageSquare,
}

/** Полная мапа thread_icon → компонент (строится один раз при загрузке модуля,
 *  не в рендере). Для канальных тредов даёт самолётик/конверт/whatsapp, для
 *  задач/чатов — их собственную иконку. */
const iconByThreadIcon: Record<string, typeof Send> = {
  ...Object.fromEntries(THREAD_ICONS.map((i) => [i.value, i.icon as typeof Send])),
  // MTProto-треды иногда создаются с icon='send' — его нет в реестре
  // THREAD_ICONS, без алиаса значок падал в fallback (квадрат вместо самолётика).
  send: Send,
}

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
}

/** Стиль имени отправителя в превью (нежирный, синий). */
// Только вес — цвет имени отправителя берём из акцента треда (accent.text),
// чтобы совпадал с цветом самого треда (иконка/бейдж).
const SENDER_NAME_CLASS = 'font-normal'

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
}: InboxChatItemProps) {
  const prefetchMessages = usePrefetchThreadMessages()

  /** Имя автора для превью: «Я», если это текущий пользователь; для email-адреса
   *  (содержит «@») — локальная часть до «@»; иначе первое слово имени
   *  (Telegram-style — без фамилии). */
  const displaySenderName = (name: string | null): string | null => {
    if (!name) return null
    if (selfSenderName && name === selfSenderName) return 'Я'
    const trimmed = name.trim()
    if (trimmed.includes('@')) return trimmed.split('@')[0] || trimmed
    return trimmed.split(/\s+/)[0] || trimmed
  }

  // Черновик из localStorage
  const draftHtml = localStorage.getItem(`msg_draft:${chat.project_id}:${chat.thread_id}`)
  const draftText = draftHtml ? stripHtml(draftHtml).trim() || null : null

  const badge = getBadgeDisplay(chat)
  const hasUnreadIndicator = badge.type !== 'none'

  // Determine latest activity: reaction (unread only) > audit event > message.
  // A read reaction stays a "badge on the message", it must not hijack the preview.
  const reactionIsNewer =
    chat.has_unread_reaction &&
    !!chat.last_reaction_at &&
    (!chat.last_message_at || chat.last_reaction_at > chat.last_message_at) &&
    (!chat.last_event_at || chat.last_reaction_at > chat.last_event_at)

  const eventIsNewer =
    !reactionIsNewer &&
    !!chat.last_event_at &&
    (!chat.last_message_at || chat.last_event_at > chat.last_message_at)

  // Галочка доставки — только когда превью показывает само сообщение (не черновик,
  // не реакцию, не событие) и оно исходящее (deliveryStatus задан сервером).
  const showDelivery = !!deliveryStatus && !draftText && !reactionIsNewer && !eventIsNewer

  const displayTime = reactionIsNewer
    ? chat.last_reaction_at
    : eventIsNewer
      ? chat.last_event_at
      : chat.last_message_at

  // Avatar + name shown in the left slot: normally the message author, but for
  // a newer unread reaction we show the person who reacted instead — otherwise
  // the row reads as "Alice reacted to her own message", which is confusing.
  // Для email-тредов без counterpart (например, исходящее без ответа) НЕ
  // показываем аватар отправителя — иначе в инбоксе у получателя стоит
  // аватарка самого юзера. Берём инициал по email_contact.
  const hasCounterpart = !!chat.counterpart_name
  const isEmailWithoutCounterpart =
    !hasCounterpart && chat.channel_type === 'email' && !!chat.email_contact
  // Многоучастниковый тред (задача внутри проекта или TG-группа): единого
  // «собеседника» нет, поэтому аватар = автор показанного действия. В диалогах
  // 1:1 оставляем собеседника (иначе в исходящем висела бы своя же аватарка).
  const isMultiParticipant = chat.thread_type === 'task' || chat.channel_type === 'telegram'
  // Имя автора события зашито в начало last_event_text («Имя · …»).
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
    // событие → автор события; иначе → автор последнего сообщения
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

  const accent = accentStyles[chat.thread_accent_color] ?? defaultAccent
  // Заглушённый тред — бейдж непрочитанного светло-серый (архив Telegram),
  // а не в акцент треда.
  const badgeBg = mutedBadge ? 'bg-gray-300' : accent.badge
  const badgeText = mutedBadge ? 'text-gray-600' : 'text-white'
  // Значок канала на аватаре: backend схлопывает WhatsApp/Business/MTProto/group
  // в channel_type='telegram', но thread_icon различает прямой канал
  // (whatsapp/telegram/mail/send). Берём иконку по thread_icon, чтобы WhatsApp,
  // Telegram и Email были визуально разными; иначе fallback по channel_type.
  // Иконка значка: по thread_icon (канал ИЛИ иконка задачи/чата), иначе по
  // каналу, иначе дефолт. Цвет — фирменный для каналов, серый для прочих.
  const ChannelIcon =
    iconByThreadIcon[chat.thread_icon] ?? channelIcons[chat.channel_type] ?? MessageSquare
  // Цвет значка канала = акцент треда (как кольцо аватара/бейдж), единообразно
  // для всех типов. Раньше был фирменный цвет приложения (email-красный и т.п.),
  // что рассинхронивалось с акцентом треда (фиолетовый тред + красный конверт).
  const channelColor = accent.text

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => prefetchMessages(chat.thread_id, chat.project_id)}
      className={cn(
        'group/chat w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
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
            {(avatarFallbackName ?? chat.thread_name).charAt(0).toUpperCase()}
          </div>
        )}
        {/* Значок в углу аватара: канал (в фирменном цвете) или иконка треда */}
        <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center">
          <ChannelIcon className={cn('h-3 w-3', channelColor)} />
        </div>
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
              {hideProjectName || !chat.project_name ? chat.thread_name : chat.project_name}
            </span>
            {!hideProjectName && chat.project_name && (
              <span className="text-gray-400 font-normal"> ({chat.thread_name})</span>
            )}
          </span>
          <span className="text-[11px] text-gray-400 shrink-0 ml-2">
            {formatTime(displayTime)}
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
            ) : reactionIsNewer && chat.last_reaction_emoji ? (
              <span className="italic text-gray-500">
                {chat.last_reaction_sender_name && (
                  <span className={cn('not-italic', SENDER_NAME_CLASS, accent.text)}>
                    {displaySenderName(chat.last_reaction_sender_name)}
                  </span>
                )}
                {chat.last_reaction_sender_name ? ' отреагировал(а) ' : 'Реакция '}
                <span className="not-italic">{chat.last_reaction_emoji}</span>
                {chat.last_reaction_message_preview && (
                  <>
                    {' на: '}
                    {truncateText(stripHtmlIgnoreQuotes(chat.last_reaction_message_preview), 30)}
                  </>
                )}
              </span>
            ) : eventIsNewer && chat.last_event_text ? (
              (() => {
                // Текст события может начинаться с автора: «Имя · Статус: …».
                // Подсвечиваем имя статуса (после «Статус: »), всё до него — серым.
                const evt = chat.last_event_text
                const idx = evt.indexOf(STATUS_PREFIX)
                if (chat.last_event_status_color && idx >= 0) {
                  return (
                    <span className="italic">
                      <span className="text-gray-500">
                        {evt.slice(0, idx + STATUS_PREFIX.length)}
                      </span>
                      <span style={{ color: safeCssColor(chat.last_event_status_color) }}>
                        {evt.slice(idx + STATUS_PREFIX.length)}
                      </span>
                    </span>
                  )
                }
                return <span className="text-amber-600 italic">{evt}</span>
              })()
            ) : (() => {
              // Текстовое превью: есть осмысленный текст (не плейсхолдер, не пустота).
              const strippedText = chat.last_message_text
                ? stripHtmlIgnoreQuotes(chat.last_message_text)
                : ''
              const hasRealText = strippedText.length > 0 && !isAttachmentPlaceholderText(strippedText)
              const hasMediaSignal =
                chat.last_message_attachment_name ||
                chat.last_message_attachment_mime ||
                chat.last_message_attachment_count > 0

              if (hasRealText) {
                return (
                  <>
                    {chat.last_sender_name && (
                      <span className={cn(SENDER_NAME_CLASS, accent.text)}>
                        {displaySenderName(chat.last_sender_name)}:{' '}
                      </span>
                    )}
                    {truncateText(strippedText)}
                  </>
                )
              }

              if (hasMediaSignal) {
                // Если для media известен mime — даём осмысленное «Голосовое /
                // Изображение / Видео». Иначе — имя файла под скрепкой.
                const media = getMediaPreview(
                  chat.last_message_attachment_mime ?? null,
                  chat.last_message_attachment_name,
                )
                // ВАЖНО: рендерим эмодзи+подпись ОБЫЧНЫМ инлайн-текстом, без
                // inline-flex. Контейнер строки — `truncate` (text-overflow:
                // ellipsis), а inline-flex = атомарный строчный блок: его нельзя
                // обрезать многоточием, при переполнении он отсекается целиком и
                // ellipsis встаёт сразу после имени отправителя → «Имя: …», файл
                // не виден. Инлайн-текст обрезается корректно.
                return (
                  <>
                    {chat.last_sender_name && (
                      <span className={cn(SENDER_NAME_CLASS, accent.text)}>
                        {displaySenderName(chat.last_sender_name)}:{' '}
                      </span>
                    )}
                    <span aria-hidden>{media.emoji}</span>{' '}
                    {truncateText(media.label, 36)}
                    {chat.last_message_attachment_count > 1 && (
                      <span className="text-gray-400">
                        {' +'}
                        {chat.last_message_attachment_count - 1}
                      </span>
                    )}
                  </>
                )
              }

              return <span className="text-gray-400">Нет сообщений</span>
            })()}
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
    </button>
  )
})
