import { describe, it, expect } from 'vitest'
import {
  buildMessageTimeline,
  timelineItemDate,
  type TimelineUnreadOpts,
} from './buildMessageTimeline'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import type { ThreadAuditEvent } from '@/hooks/messenger/useThreadAuditEvents'

const msg = (id: string, created_at: string): ProjectMessage =>
  ({ id, created_at, content: '', sender_participant_id: null } as unknown as ProjectMessage)

const ev = (
  id: string,
  created_at: string,
  action: string,
  user_id: string | null = 'other',
): ThreadAuditEvent =>
  ({ id, created_at, action, user_id } as unknown as ThreadAuditEvent)

// Всё прочитано (lastReadAtMs в будущем), зритель получает события.
const READ_OPTS: TimelineUnreadOpts = {
  suppressUnread: false,
  viewerGetsEvents: true,
  isLastReadAtLoaded: true,
  currentUserId: 'me',
  lastReadAtMs: Date.parse('2100-01-01T00:00:00Z'),
}

describe('buildMessageTimeline', () => {
  it('без событий → только message-элементы с индексами', () => {
    const messages = [msg('m1', '2026-07-01T10:00:00Z'), msg('m2', '2026-07-01T11:00:00Z')]
    const items = buildMessageTimeline(messages, [], READ_OPTS)
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.kind === 'message')).toBe(true)
    expect(items.map((i) => (i.kind === 'message' ? i.idx : -1))).toEqual([0, 1])
  })

  it('прочитанные однотипные события подряд складываются в event-group', () => {
    const events = [
      ev('e1', '2026-07-01T09:00:00Z', 'change_status'),
      ev('e2', '2026-07-01T09:01:00Z', 'change_status'),
      ev('e3', '2026-07-01T09:02:00Z', 'change_status'),
    ]
    const items = buildMessageTimeline([msg('m1', '2026-07-01T10:00:00Z')], events, READ_OPTS)
    expect(items).toHaveLength(2) // group + message
    expect(items[0].kind).toBe('event-group')
    if (items[0].kind === 'event-group') expect(items[0].events).toHaveLength(3)
    expect(items[1].kind).toBe('message')
  })

  it('непрочитанное событие не попадает в группу (отдельный kind event)', () => {
    const opts: TimelineUnreadOpts = { ...READ_OPTS, lastReadAtMs: Date.parse('2000-01-01T00:00:00Z') }
    const events = [
      ev('e1', '2026-07-01T09:00:00Z', 'change_status', 'other'),
      ev('e2', '2026-07-01T09:01:00Z', 'change_status', 'other'),
    ]
    const items = buildMessageTimeline([], events, opts)
    // оба чужие и после lastRead → непрочитанные → по отдельности
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.kind === 'event')).toBe(true)
  })

  it('своё событие (user_id === currentUserId) считается прочитанным → в группу', () => {
    const opts: TimelineUnreadOpts = { ...READ_OPTS, lastReadAtMs: Date.parse('2000-01-01T00:00:00Z') }
    const events = [ev('e1', '2026-07-01T09:00:00Z', 'change_status', 'me')]
    const items = buildMessageTimeline([], events, opts)
    expect(items[0].kind).toBe('event-group')
  })

  it('change_deadline никогда не непрочитанное → всегда в группу', () => {
    const opts: TimelineUnreadOpts = { ...READ_OPTS, lastReadAtMs: Date.parse('2000-01-01T00:00:00Z') }
    const events = [
      ev('e1', '2026-07-01T09:00:00Z', 'change_deadline', 'other'),
      ev('e2', '2026-07-01T09:01:00Z', 'change_deadline', 'other'),
    ]
    const items = buildMessageTimeline([], events, opts)
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('event-group')
    if (items[0].kind === 'event-group') expect(items[0].events).toHaveLength(2)
  })

  it('разнотипные прочитанные события идут отдельными группами', () => {
    const events = [
      ev('e1', '2026-07-01T09:00:00Z', 'change_status'),
      ev('e2', '2026-07-01T09:01:00Z', 'rename'),
    ]
    const items = buildMessageTimeline([], events, READ_OPTS)
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.kind === 'event-group')).toBe(true)
  })

  it('timelineItemDate возвращает дату для каждого вида элемента', () => {
    expect(timelineItemDate({ kind: 'message', msg: msg('m', '2026-07-01T10:00:00Z'), idx: 0 })).toBe(
      '2026-07-01T10:00:00Z',
    )
    expect(timelineItemDate({ kind: 'event', event: ev('e', '2026-07-01T09:00:00Z', 'x') })).toBe(
      '2026-07-01T09:00:00Z',
    )
    expect(
      timelineItemDate({ kind: 'event-group', events: [ev('e', '2026-07-01T08:00:00Z', 'x')] }),
    ).toBe('2026-07-01T08:00:00Z')
  })
})
