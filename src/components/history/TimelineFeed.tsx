"use client"

/**
 * TimelineFeed — единая лента аудит-событий и переписки.
 * Использует настоящий MessageBubble из мессенджера.
 * Группировка по дням, разделители чатов между блоками сообщений.
 */

import { useMemo, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { getChatIconComponent } from '@/components/messenger/ChatSettingsDialog'
import { MessageBubble } from '@/components/messenger/MessageBubble'
import { ActivityItem } from './ActivityItem'
import type { AuditLogEntry } from '@/types/history'
import type { TimelineMessageEntry } from '@/hooks/useTimelineMessages'
import type { MessengerAccent } from '@/components/messenger/utils/messageStyles'

type TimelineEntry =
  | { kind: 'audit'; data: AuditLogEntry }
  | { kind: 'message'; entry: TimelineMessageEntry }

interface TimelineFeedProps {
  auditEntries: AuditLogEntry[]
  messages: TimelineMessageEntry[]
  currentUserId?: string
  lastReadAt?: string
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
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
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
  onOpenChat,
}: TimelineFeedProps) {
  const merged = useMemo(() => mergeTimeline(auditEntries, messages), [auditEntries, messages])
  const grouped = useMemo(() => groupByDay(merged), [merged])
  const bottomRef = useRef<HTMLDivElement>(null)
  const initialLoadDone = useRef(false)

  // Автоскролл вниз при начальной загрузке (аудит + сообщения могут прийти в разное время)
  useEffect(() => {
    if (merged.length > 0) {
      // Скроллим при каждом изменении длины в первые 3 секунды после монтирования
      if (!initialLoadDone.current) {
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView())
        // Через 3 секунды прекращаем автоскролл — данные загружены
        const timer = setTimeout(() => {
          initialLoadDone.current = true
        }, 3000)
        return () => clearTimeout(timer)
      }
    }
  }, [merged.length])

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
          <div>
            {dayEntries.map((entry, idx) => {
              const chatDivider = getChatDivider(dayEntries, idx)
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
                    <ActivityItem
                      entry={entry.data}
                      isUnread={!!lastReadAt && entry.data.created_at > lastReadAt}
                    />
                  ) : (
                    <div className="px-2">
                      <MessageBubble
                        message={entry.entry.message}
                        isOwn={!!currentUserId && entry.entry.senderUserId === currentUserId}
                        currentParticipantId={null}
                        accent={entry.entry.thread.accent_color as MessengerAccent}
                        showAvatar={
                          // Show avatar if previous entry is not a message from same sender
                          idx === 0 ||
                          dayEntries[idx - 1].kind !== 'message' ||
                          (dayEntries[idx - 1].kind === 'message' &&
                            (
                              dayEntries[idx - 1] as {
                                kind: 'message'
                                entry: TimelineMessageEntry
                              }
                            ).entry.message.sender_participant_id !==
                              entry.entry.message.sender_participant_id)
                        }
                        onReply={noop}
                        onReact={noop}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

/** Определить, нужен ли разделитель чата перед entry[idx] */
function getChatDivider(
  entries: TimelineEntry[],
  idx: number,
): { threadId: string; name: string; icon: string; accent: string } | null {
  const entry = entries[idx]
  if (entry.kind !== 'message') return null

  const currentThreadId = entry.entry.thread.id

  if (idx === 0) {
    return {
      threadId: currentThreadId,
      name: entry.entry.thread.name,
      icon: entry.entry.thread.icon,
      accent: entry.entry.thread.accent_color,
    }
  }

  const prev = entries[idx - 1]
  if (prev.kind !== 'message' || prev.entry.thread.id !== currentThreadId) {
    return {
      threadId: currentThreadId,
      name: entry.entry.thread.name,
      icon: entry.entry.thread.icon,
      accent: entry.entry.thread.accent_color,
    }
  }

  return null
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
  const accentColor = ACCENT_TEXT[threadAccent] ?? 'text-blue-500'
  const accentBg = ACCENT_BG[threadAccent] ?? 'bg-blue-50'

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

const ACCENT_TEXT: Record<string, string> = {
  blue: 'text-blue-600',
  slate: 'text-stone-600',
  emerald: 'text-emerald-600',
  amber: 'text-amber-600',
  rose: 'text-red-600',
  violet: 'text-violet-600',
  orange: 'text-orange-600',
  cyan: 'text-cyan-600',
  pink: 'text-pink-600',
  indigo: 'text-indigo-600',
}

const ACCENT_BG: Record<string, string> = {
  blue: 'bg-blue-50/70',
  slate: 'bg-stone-50/70',
  emerald: 'bg-emerald-50/70',
  amber: 'bg-amber-50/70',
  rose: 'bg-red-50/70',
  violet: 'bg-violet-50/70',
  orange: 'bg-orange-50/70',
  cyan: 'bg-cyan-50/70',
  pink: 'bg-pink-50/70',
  indigo: 'bg-indigo-50/70',
}
