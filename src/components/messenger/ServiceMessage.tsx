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
import { Loader2, X } from 'lucide-react'
import { formatAuditEvent, type ThreadAuditEvent } from '@/hooks/messenger/useThreadAuditEvents'
import { safeCssColor } from '@/utils/isValidCssColor'
import { cn } from '@/lib/utils'

type ServiceMessageProps =
  | {
      event: ThreadAuditEvent
      isUnread?: boolean
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
            ? 'text-red-600 bg-red-50 border-red-300'
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
              'opacity-0 group-hover:opacity-100 transition-opacity',
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
