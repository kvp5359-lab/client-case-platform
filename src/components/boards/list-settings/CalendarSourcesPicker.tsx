"use client"

/**
 * Мультиселект источников-календарей для режима display_mode='calendar'.
 */

import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useWorkspaceCalendars } from '@/hooks/useGoogleCalendar'

export function CalendarSourcesPicker({
  workspaceId,
  value,
  onChange,
}: {
  workspaceId: string
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const { data: calendars = [], isLoading } = useWorkspaceCalendars(workspaceId)
  const selected = new Set(value)

  if (isLoading) {
    return <p className="text-[11px] text-muted-foreground">Загрузка календарей…</p>
  }

  if (calendars.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Источников ещё нет. Подключите Google Calendar в Настройки → Интеграции.
      </p>
    )
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-muted-foreground">Источники-календари</Label>
      <div className="space-y-1">
        {calendars.map((cal) => (
          <label
            key={cal.id}
            className="flex items-center gap-2 cursor-pointer select-none text-xs"
          >
            <Checkbox
              checked={selected.has(cal.id)}
              onCheckedChange={(v) => {
                const next = new Set(selected)
                if (v) next.add(cal.id)
                else next.delete(cal.id)
                onChange(Array.from(next))
              }}
            />
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: cal.color }}
            />
            <span className="truncate">{cal.name}</span>
            <span className="ml-auto text-[10px] text-muted-foreground/70">
              {cal.source === 'google' ? 'Google' : 'внутренний'}
            </span>
          </label>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground/70">
        Если ничего не выбрано — показываются только задачи из фильтра.
      </p>
    </div>
  )
}
