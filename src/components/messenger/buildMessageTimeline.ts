/**
 * Построение ленты треда: сообщения + служебные события (audit) в один
 * хронологический список. Прочитанные события одного типа, идущие подряд (без
 * сообщения между ними), складываются в 'event-group' — чтобы «Кирилл перенёс
 * срок» изо дня в день не забивали ленту. Непрочитанные события в группу не
 * попадают (kind 'event') и всегда видны.
 *
 * Чистая функция — вынесена из MessageList.tsx (аудит 2026-07-13) ради
 * тестируемости; логика не менялась.
 */
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import type { ThreadAuditEvent } from '@/hooks/messenger/useThreadAuditEvents'

export type TimelineItem =
  | { kind: 'message'; msg: ProjectMessage; idx: number }
  | { kind: 'event'; event: ThreadAuditEvent }
  | { kind: 'event-group'; events: ThreadAuditEvent[] }

export type TimelineUnreadOpts = {
  suppressUnread: boolean
  viewerGetsEvents: boolean
  isLastReadAtLoaded: boolean
  currentUserId: string | null
  lastReadAtMs: number | null
}

export function buildMessageTimeline(
  messages: ProjectMessage[],
  auditEvents: ThreadAuditEvent[],
  opts: TimelineUnreadOpts,
): TimelineItem[] {
  if (auditEvents.length === 0) {
    return messages.map((msg, idx) => ({ kind: 'message' as const, msg, idx }))
  }

  const { suppressUnread, viewerGetsEvents, isLastReadAtLoaded, currentUserId, lastReadAtMs } = opts

  // Событие непрочитано (чужое и после last_read_at) — та же формула, что при рендере.
  // Перенос срока (change_deadline) непрочитанным НЕ считается — фоновое движение
  // планов, согласовано с сервером (recompute_thread_unread_for исключает его из инбокса).
  const isEventUnread = (ev: ThreadAuditEvent) =>
    !suppressUnread &&
    viewerGetsEvents &&
    isLastReadAtLoaded &&
    ev.action !== 'change_deadline' &&
    ev.user_id !== currentUserId &&
    (lastReadAtMs === null || Date.parse(ev.created_at) > lastReadAtMs)

  const items: TimelineItem[] = []
  // Кладём событие: прочитанные однотипные, идущие подряд, копятся в группу.
  const pushEvent = (ev: ThreadAuditEvent) => {
    if (isEventUnread(ev)) {
      items.push({ kind: 'event', event: ev })
      return
    }
    const last = items[items.length - 1]
    if (last && last.kind === 'event-group' && last.events[0].action === ev.action) {
      last.events.push(ev)
    } else {
      items.push({ kind: 'event-group', events: [ev] })
    }
  }

  let ei = 0
  for (let mi = 0; mi < messages.length; mi++) {
    // Insert events that happened before this message
    while (ei < auditEvents.length && auditEvents[ei].created_at <= messages[mi].created_at) {
      pushEvent(auditEvents[ei])
      ei++
    }
    items.push({ kind: 'message', msg: messages[mi], idx: mi })
  }
  // Remaining events after last message
  while (ei < auditEvents.length) {
    pushEvent(auditEvents[ei])
    ei++
  }
  return items
}

/**
 * Дата элемента ленты (сообщение / событие / группа событий) — для разделителя
 * даты. Разделитель считается по ВСЕЙ ленте, а не только по сообщениям, иначе
 * тред из одних событий (напр. только «создал(а)», без сообщений) остаётся без
 * даты — видно лишь время.
 */
export function timelineItemDate(it: TimelineItem): string {
  return it.kind === 'message'
    ? it.msg.created_at
    : it.kind === 'event'
      ? it.event.created_at
      : it.events[0].created_at
}
