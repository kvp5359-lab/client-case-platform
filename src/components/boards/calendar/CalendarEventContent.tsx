/**
 * Контент события в сетке: название задачи + название проекта мелким
 * под ней. Время рендерит сам RBC в .rbc-event-label (см. CSS
 * flex-порядок в globals.css).
 */

import type { CalEvent } from './calEventTypes'
import { useThreadNameResolver } from '@/hooks/useThreadUserNames'

export function CalendarEventContent({ event }: { event: CalEvent }) {
  const resolveThreadName = useThreadNameResolver()
  const project = event.resource?.project_name
  return (
    <>
      <div className="font-medium truncate">{resolveThreadName(event.id, event.title)}</div>
      {project && (
        <div className="truncate opacity-75 text-[10px] leading-tight">{project}</div>
      )}
    </>
  )
}
