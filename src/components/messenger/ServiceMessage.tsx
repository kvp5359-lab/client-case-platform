"use client"

/**
 * Сервисное сообщение: изменение статуса, создание, переименование, а также
 * системные сообщения Telegram (создание группы, добавил/удалил участника и т.д.).
 *
 * Принимает либо audit-`event` (тогда для change_status рендерит цветные имена
 * статусов), либо плоскую пару `text + time` (для telegram_service / bot_event).
 *
 * Опционально показывает кнопку «×» при ховере для удаления — используется
 * владельцем воркспейса, чтобы чистить историю от служебных уведомлений TG.
 */

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Loader2, X } from 'lucide-react'
import {
  formatAuditEvent,
  summarizeEventGroup,
  type ThreadAuditEvent,
} from '@/hooks/messenger/useThreadAuditEvents'
import { safeCssColor } from '@/utils/isValidCssColor'
import { cn } from '@/lib/utils'

type ServiceMessageProps =
  | {
      event: ThreadAuditEvent
      isUnread?: boolean
      /** Тон непрочитанного события: 'red' (обычный) / 'slate' (заглушённый тред). */
      unreadTone?: 'red' | 'slate'
      canDelete?: false
    }
  | {
      text: string
      time: string
      messageId?: string
      canDelete?: boolean
      onDelete?: (messageId: string) => Promise<void> | void
    }

export function ServiceMessage(props: ServiceMessageProps) {
  const time = 'event' in props ? props.event.created_at : props.time
  const d = new Date(time)
  const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

  let content: ReactNode
  if ('event' in props) {
    const sc = props.event.status_change
    content = sc ? (
      <>
        {sc.actorName} изменил(а) статус:{' '}
        <span
          className="font-medium"
          style={sc.oldColor ? { color: safeCssColor(sc.oldColor) } : undefined}
        >
          {sc.oldName}
        </span>
        {' → '}
        <span
          className="font-medium"
          style={sc.newColor ? { color: safeCssColor(sc.newColor) } : undefined}
        >
          {sc.newName}
        </span>
      </>
    ) : (
      formatAuditEvent(props.event)
    )
  } else {
    content = props.text
  }

  const isUnread = 'event' in props && !!props.isUnread
  const unreadTone = ('event' in props && props.unreadTone) || 'red'
  const canDelete = !('event' in props) && props.canDelete && !!props.messageId && !!props.onDelete
  const messageId = !('event' in props) ? props.messageId : undefined
  const onDelete = !('event' in props) ? props.onDelete : undefined

  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!canDelete || !messageId || !onDelete || deleting) return
    setDeleting(true)
    try {
      await onDelete(messageId)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="group flex justify-center py-1">
      <span
        className={cn(
          'relative inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full border',
          isUnread
            ? unreadTone === 'slate'
              ? 'text-slate-600 bg-slate-100 border-slate-300'
              : 'text-red-600 bg-red-50 border-red-300'
            : 'text-muted-foreground bg-muted/60 border-transparent',
        )}
      >
        <span>
          {content} · {timeStr}
        </span>
        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            title="Удалить"
            className={cn(
              'md:opacity-0 md:group-hover:opacity-100 transition-opacity',
              'inline-flex items-center justify-center w-4 h-4 rounded-full',
              'text-muted-foreground hover:text-red-600 hover:bg-red-100',
              deleting && 'opacity-100',
            )}
          >
            {deleting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <X className="w-3 h-3" />
            )}
          </button>
        )}
      </span>
    </div>
  )
}

/**
 * Свёрнутая группа подряд идущих однотипных ПРОЧИТАННЫХ событий (например,
 * задача, у которой срок переносили изо дня в день). По умолчанию показывает
 * одну строку-сводку «Срок переносили 7 раз: 28 мая → 2 июл»; по клику
 * разворачивает полный список отдельных событий. Непрочитанные события сюда
 * не попадают — их собирает MessageList и рендерит поштучно.
 */
export function ServiceEventGroup({ events }: { events: ThreadAuditEvent[] }) {
  const [open, setOpen] = useState(false)
  const last = events[events.length - 1]
  const timeStr = new Date(last.created_at).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })

  if (open) {
    return (
      <>
        {events.map((ev) => (
          <ServiceMessage key={`event-${ev.id}`} event={ev} isUnread={false} />
        ))}
        <div className="flex justify-center py-1">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border border-transparent text-muted-foreground bg-muted/60 hover:bg-muted transition-colors"
          >
            Свернуть
            <ChevronUp className="w-3 h-3" />
          </button>
        </div>
      </>
    )
  }

  return (
    <div className="flex justify-center py-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Показать все изменения"
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border border-transparent text-muted-foreground bg-muted/60 hover:bg-muted transition-colors"
      >
        <span>
          {summarizeEventGroup(events)} · {timeStr}
        </span>
        <ChevronDown className="w-3 h-3 shrink-0" />
      </button>
    </div>
  )
}
