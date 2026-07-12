/**
 * Лента событий с группировкой по дням
 */

import type { AuditLogEntry } from '@/types/history'
import { ActivityItem } from './ActivityItem'
import { formatDayHeader, dayKey } from './historyDateHelpers'

type ActivityFeedProps = {
  entries: AuditLogEntry[]
  lastReadAt?: string
  statusNames?: Map<string, string>
}

function groupByDay(entries: AuditLogEntry[]): Map<string, AuditLogEntry[]> {
  const groups = new Map<string, AuditLogEntry[]>()
  for (const entry of entries) {
    const key = dayKey(entry.created_at)
    const existing = groups.get(key)
    if (existing) {
      existing.push(entry)
    } else {
      groups.set(key, [entry])
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
