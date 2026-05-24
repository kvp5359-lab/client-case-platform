/**
 * Кастомный toolbar — копирует дефолтное поведение RBC + добавляет
 * кнопку «Синхронизировать» справа (если в настройках списка выбраны
 * Google-календари).
 */

import { type ToolbarProps, type View } from 'react-big-calendar'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CalEvent } from './calEventTypes'

export function makeCalendarToolbar(
  calendarIds: string[],
  onSync: () => void,
  syncing: boolean,
) {
  return function CalendarToolbar(props: ToolbarProps<CalEvent>) {
    const { label, onNavigate, onView, view, views } = props
    const viewsList = Array.isArray(views) ? views : Object.keys(views)
    return (
      <div className="rbc-toolbar">
        <span className="rbc-btn-group">
          <button type="button" onClick={() => onNavigate('TODAY')}>Сегодня</button>
          <button type="button" onClick={() => onNavigate('PREV')}>←</button>
          <button type="button" onClick={() => onNavigate('NEXT')}>→</button>
        </span>
        <span className="rbc-toolbar-label">{label}</span>
        <span className="rbc-btn-group">
          {viewsList.map((name) => (
            <button
              key={name}
              type="button"
              className={view === name ? 'rbc-active' : ''}
              onClick={() => onView(name as View)}
            >
              {props.localizer.messages[name as keyof typeof props.localizer.messages] as string}
            </button>
          ))}
          {calendarIds.length > 0 && (
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              title="Синхронизировать Google-календари"
              className="!px-2"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
            </button>
          )}
        </span>
      </div>
    )
  }
}
