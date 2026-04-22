/**
 * Лента событий с группировкой по дням
 */

import type { AuditLogEntry } from '@/types/history'
import { ActivityItem } from './ActivityItem'

interface ActivityFeedProps {
  entries: AuditLogEntry[]
  lastReadAt?: string
  statusNames?: Map<string, string>
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

function groupByDay(entries: AuditLogEntry[]): Map<string, AuditLogEntry[]> {
  const groups = new Map<string, AuditLogEntry[]>()
  for (const entry of entries) {
    const date = new Date(entry.created_at)
    const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    const existing = groups.get(dayKey)
    if (existing) {
      existing.push(entry)
    } else {
      groups.set(dayKey, [entry])
    }
  }
  return groups
}

export function ActivityFeed({ entries, lastReadAt, statusNames }: ActivityFeedProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-base">Нет событий</p>
        <p className="text-sm mt-1">История изменений появится здесь</p>
      </div>
    )
  }

  const grouped = groupByDay(entries)

  return (
    <div className="divide-y">
      {Array.from(grouped.entries()).map(([dayKey, dayEntries]) => (
        <div key={dayKey}>
          <div className="sticky top-0 bg-muted/50 backdrop-blur-sm px-4 py-1.5 border-b">
            <span className="text-xs font-medium text-muted-foreground">
              {formatDayHeader(dayEntries[0].created_at)}
            </span>
          </div>
          <div className="divide-y divide-border/50">
            {dayEntries.map((entry) => (
              <ActivityItem
                key={entry.id}
                entry={entry}
                isUnread={!!lastReadAt && entry.created_at > lastReadAt}
                statusNames={statusNames}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
