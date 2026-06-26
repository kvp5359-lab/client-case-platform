"use client"

/**
 * TimelineFeed — единая лента аудит-событий и переписки.
 * Использует настоящий MessageBubble из мессенджера.
 * Группировка по дням, разделители чатов между блоками сообщений.
 */

import { useMemo, useCallback, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'
import { MessageBubble } from '@/components/messenger/MessageBubble'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads.types'
import { acc, ACCENT_SLUGS } from '@/lib/accentPalette'
import { MessengerProvider } from '@/components/messenger/MessengerContext'
import { ServiceMessage } from '@/components/messenger/ServiceMessage'
import { AuditPill } from './AuditPill'
import type { AuditLogEntry } from '@/types/history'
import { formatLongDate } from '@/utils/format/dateFormat'
import type { TimelineMessageEntry } from '@/hooks/useTimelineMessages'
import type { MessengerAccent } from '@/components/messenger/utils/messageStyles'
import { deleteMessage } from '@/services/api/messenger/messengerService'
import { messengerKeys, timelineKeys } from '@/hooks/queryKeys'
import { useWorkspacePermissions } from '@/hooks/permissions'

type TimelineEntry =
  | { kind: 'audit'; data: AuditLogEntry }
  | { kind: 'message'; entry: TimelineMessageEntry }

type TimelineFeedProps = {
  auditEntries: AuditLogEntry[]
  messages: TimelineMessageEntry[]
  currentUserId?: string
  /** Общий lastReadAt для ленты (совместимость со старым вызовом из HistoryTabContent). */
  lastReadAt?: string
  /** last_read_at по каждому треду — для красной рамки «непрочитано» в бабблах. */
  threadLastReadAt?: Map<string, string>
  /** id статуса → {name, color} — для цветных имён в change_status аудите. */
  statusMap?: Map<string, { name: string; color: string | null }>
  /** Set thread_id, у которых есть участник-«Клиент» / линк на TG/Email — для
   *  подсветки сообщений сотрудников (как в обычном режиме треда). */
  clientThreadIds?: Set<string>
  /** Нужны для инвалидации таймлайн-кэша после удаления служебных сообщений
   *  TG (добавил/удалил участника) — кнопка «×» доступна владельцу воркспейса. */
  projectId?: string
  workspaceId?: string
  onOpenChat?: (threadId: string) => void
}

function formatDayHeader(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const entryDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.floor((today.getTime() - entryDay.getTime()) / 86_400_000)

  if (diffDays === 0) return 'Сегодня'
  if (diffDays === 1) return 'Вчера'
  return formatLongDate(date)
}

function getDayKey(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function getCreatedAt(entry: TimelineEntry): string {
  return entry.kind === 'audit' ? entry.data.created_at : entry.entry.message.created_at
}

/** Объединить аудит + сообщения и отсортировать ASC (старые сверху, новые внизу) */
function mergeTimeline(audits: AuditLogEntry[], messages: TimelineMessageEntry[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...audits.map((a) => ({ kind: 'audit' as const, data: a })),
    ...messages.map((m) => ({ kind: 'message' as const, entry: m })),
  ]
  entries.sort((a, b) => getCreatedAt(a).localeCompare(getCreatedAt(b)))
  return entries
}

/** Группировка по дням */
function groupByDay(entries: TimelineEntry[]): Map<string, TimelineEntry[]> {
  const groups = new Map<string, TimelineEntry[]>()
  for (const entry of entries) {
    const key = getDayKey(getCreatedAt(entry))
    const existing = groups.get(key)
    if (existing) existing.push(entry)
    else groups.set(key, [entry])
  }
  return groups
}

// No-op handlers for read-only MessageBubble
const noop = () => {}

export function TimelineFeed({
  auditEntries,
  messages,
  currentUserId,
  lastReadAt,
  threadLastReadAt,
  statusMap,
  clientThreadIds,
  projectId,
  workspaceId,
  onOpenChat,
}: TimelineFeedProps) {
  const merged = useMemo(() => mergeTimeline(auditEntries, messages), [auditEntries, messages])
  const grouped = useMemo(() => groupByDay(merged), [merged])

  const queryClient = useQueryClient()
  const { isOwner } = useWorkspacePermissions({ workspaceId: workspaceId ?? '' })
  const handleDeleteServiceMessage = useCallback(
    async (messageId: string) => {
      try {
        await deleteMessage(messageId)
        // Инвалидируем все возможные кэши, где сообщение могло отражаться:
        // лента таймлайна (этой страницы), список сообщений треда (если открыт
        // в правой панели), inbox-агрегаты.
        queryClient.invalidateQueries({ queryKey: timelineKeys.messages(projectId ?? '', []), exact: false })
        queryClient.invalidateQueries({ queryKey: messengerKeys.all })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Не удалось удалить сообщение')
      }
    },
    [queryClient, projectId],
  )

  // Set of message IDs, перед которыми нужен ChatDivider. Вычисляется плоским
  // проходом по всей ленте, поэтому смена дня (внутри того же треда) НЕ добавляет
  // разделитель — он только там, где реально меняется тред. Ключ — id сообщения.
  const dividerMessageIds = useMemo(() => {
    const set = new Set<string>()
    let lastThreadId: string | null = null
    for (const entry of merged) {
      if (entry.kind !== 'message') continue
      const tid = entry.entry.thread.id
      if (tid !== lastThreadId) {
        set.add(entry.entry.message.id)
        lastThreadId = tid
      }
    }
    return set
  }, [merged])
  const bottomRef = useRef<HTMLDivElement>(null)
  const userInteracted = useRef(false)

  // Автоскролл вниз — держим на последних сообщениях, пока пользователь не
  // проскроллит сам. Данные приходят двумя батчами (аудит → сообщения), поэтому
  // одного скролла недостаточно — после прихода второго батча длина ленты
  // растёт, и без повторного scrollIntoView вьюпорт остаётся посередине.
  useEffect(() => {
    if (userInteracted.current) return
    if (merged.length === 0) return
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView())
  }, [merged.length])

  // Любое действие пользователя (скролл/колёсико/тач) блокирует автоскролл.
  useEffect(() => {
    const lock = () => {
      userInteracted.current = true
    }
    window.addEventListener('wheel', lock, { passive: true, once: true })
    window.addEventListener('touchmove', lock, { passive: true, once: true })
    return () => {
      window.removeEventListener('wheel', lock)
      window.removeEventListener('touchmove', lock)
    }
  }, [])

  const handleChatClick = useCallback(
    (threadId: string) => {
      onOpenChat?.(threadId)
    },
    [onOpenChat],
  )

  if (merged.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-base">Нет событий</p>
        <p className="text-sm mt-1">История изменений и переписка появятся здесь</p>
      </div>
    )
  }

  return (
    <div>
      {Array.from(grouped.entries()).map(([dayKey, dayEntries]) => (
        <div key={dayKey}>
          {/* Day header — centered pill */}
          <div className="sticky top-0 z-10 flex justify-center py-2">
            <span className="px-3 py-1 rounded-full bg-gray-200/80 backdrop-blur-sm text-[11px] font-medium text-gray-500">
              {formatDayHeader(getCreatedAt(dayEntries[0]))}
            </span>
          </div>

          {/* Entries */}
          <div className="space-y-2">
            {dayEntries.map((entry, idx) => {
              const chatDivider =
                entry.kind === 'message' && dividerMessageIds.has(entry.entry.message.id)
                  ? {
                      threadId: entry.entry.thread.id,
                      name: entry.entry.thread.name,
                      icon: entry.entry.thread.icon,
                      accent: entry.entry.thread.accent_color,
                    }
                  : null
              const key =
                entry.kind === 'audit' ? `a-${entry.data.id}` : `m-${entry.entry.message.id}`

              return (
                <div key={key}>
                  {chatDivider && (
                    <ChatDivider
                      threadName={chatDivider.name}
                      IconComponent={getChatIconComponent(chatDivider.icon)}
                      threadAccent={chatDivider.accent}
                      onClick={() => handleChatClick(chatDivider.threadId)}
                    />
                  )}

                  {entry.kind === 'audit' ? (
                    <AuditPill
                      entry={entry.data}
                      isUnread={!!lastReadAt && entry.data.created_at > lastReadAt}
                      statusMap={statusMap}
                    />
                  ) : entry.entry.message.source === 'telegram_service' ||
                    entry.entry.message.source === 'bot_event' ? (
                    // Служебные TG-сообщения (добавил/удалил/переименовал) —
                    // та же визуальная пилюля, что и в чате, без больших баблов.
                    <ServiceMessage
                      text={entry.entry.message.content}
                      time={entry.entry.message.created_at}
                      messageId={entry.entry.message.id}
                      canDelete={isOwner}
                      onDelete={handleDeleteServiceMessage}
                    />
                  ) : (
                    (() => {
                      const isOwn =
                        !!currentUserId && entry.entry.senderUserId === currentUserId
                      const prev = dayEntries[idx - 1]
                      const prevIsMessage = prev?.kind === 'message'
                      const prevSameSender =
                        prevIsMessage &&
                        (prev as { kind: 'message'; entry: TimelineMessageEntry }).entry.message
                          .sender_participant_id === entry.entry.message.sender_participant_id
                      // Аватар/имя показываем, когда сменился автор, сменился чат
                      // (перед сообщением вставлен ChatDivider) или это первый элемент.
                      const showAvatar = !!chatDivider || idx === 0 || !prevIsMessage || !prevSameSender
                      const threadRead = threadLastReadAt?.get(entry.entry.thread.id)
                      const isUnread =
                        !isOwn &&
                        !!threadRead &&
                        entry.entry.message.created_at > threadRead
                      return (
                        <div className="px-2">
                          <MessengerProvider
                            currentParticipantId={null}
                            accent={entry.entry.thread.accent_color as MessengerAccent}
                            onReply={noop}
                            onReact={noop}
                            isClientThread={clientThreadIds?.has(entry.entry.thread.id) ?? false}
                          >
                            <MessageBubble
                              message={entry.entry.message}
                              isOwn={isOwn}
                              showAvatar={showAvatar}
                              isUnread={isUnread}
                              lastReadAt={threadRead}
                            />
                          </MessengerProvider>
                        </div>
                      )
                    })()
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <div ref={bottomRef} className="h-4" />
    </div>
  )
}

/** Кликабельный разделитель чата */
function ChatDivider({
  threadName,
  IconComponent,
  threadAccent,
  onClick,
}: {
  threadName: string
  IconComponent: React.ComponentType<{ className?: string }>
  threadAccent: string
  onClick: () => void
}) {
  const accentColor = ACCENT_TEXT[threadAccent as ThreadAccentColor] ?? 'text-blue-500'
  const accentBg = ACCENT_BG[threadAccent as ThreadAccentColor] ?? 'bg-blue-50'

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-4 py-2.5 mt-3 mb-1 text-xs font-medium transition-colors hover:opacity-80',
        accentBg,
        accentColor,
      )}
    >
      <IconComponent className="w-3.5 h-3.5" />
      <span>{threadName}</span>
      <div className={cn('flex-1 border-t border-current opacity-20')} />
    </button>
  )
}

const ACCENT_TEXT: Record<ThreadAccentColor, string> = Object.fromEntries(
  ACCENT_SLUGS.map((s) => [s, acc.textMain(s)]),
) as Record<ThreadAccentColor, string>

const ACCENT_BG: Record<ThreadAccentColor, string> = Object.fromEntries(
  ACCENT_SLUGS.map((s) => [s, acc.bgSoft(s)]),
) as Record<ThreadAccentColor, string>
