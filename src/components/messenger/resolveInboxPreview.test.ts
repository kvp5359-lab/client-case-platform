import { describe, it, expect } from 'vitest'
import { resolveInboxPreview } from './resolveInboxPreview'
import type { InboxThreadEntry } from '@/services/api/inboxService'

const base = (over: Partial<InboxThreadEntry>): InboxThreadEntry =>
  ({
    thread_id: 't',
    thread_name: 'T',
    thread_type: 'chat',
    channel_type: 'web',
    has_unread_reaction: false,
    last_message_at: null,
    last_event_at: null,
    last_reaction_at: null,
    last_message_text: null,
    last_sender_name: null,
    last_sender_avatar_url: null,
    last_event_text: null,
    last_event_sender_avatar_url: null,
    last_reaction_sender_name: null,
    last_reaction_sender_avatar_url: null,
    counterpart_name: null,
    counterpart_avatar_url: null,
    email_contact: null,
    ...over,
  } as unknown as InboxThreadEntry)

describe('resolveInboxPreview', () => {
  it('непрочитанная реакция новее сообщения → reactionIsNewer, аватар реагировавшего', () => {
    const p = resolveInboxPreview(
      base({
        has_unread_reaction: true,
        last_reaction_at: '2026-07-02T10:00:00Z',
        last_message_at: '2026-07-01T10:00:00Z',
        last_reaction_sender_name: 'Аня',
        last_reaction_sender_avatar_url: 'r.jpg',
      }),
    )
    expect(p.reactionIsNewer).toBe(true)
    expect(p.eventIsNewer).toBe(false)
    expect(p.avatarFallbackName).toBe('Аня')
    expect(p.avatarUrl).toBe('r.jpg')
    expect(p.displayTime).toBe('2026-07-02T10:00:00Z')
  })

  it('прочитанная реакция НЕ перехватывает превью', () => {
    const p = resolveInboxPreview(
      base({
        has_unread_reaction: false,
        last_reaction_at: '2026-07-02T10:00:00Z',
        last_message_at: '2026-07-01T10:00:00Z',
        last_sender_name: 'Клиент',
      }),
    )
    expect(p.reactionIsNewer).toBe(false)
  })

  it('событие новее сообщения в многоучастниковом треде → аватар автора события', () => {
    const p = resolveInboxPreview(
      base({
        thread_type: 'task',
        last_event_at: '2026-07-02T10:00:00Z',
        last_message_at: '2026-07-01T10:00:00Z',
        last_event_text: 'Пётр · Статус: Выполнено',
        last_event_sender_avatar_url: 'e.jpg',
      }),
    )
    expect(p.eventIsNewer).toBe(true)
    expect(p.eventActorName).toBe('Пётр')
    expect(p.avatarUrl).toBe('e.jpg')
    expect(p.avatarFallbackName).toBe('Пётр')
  })

  it('диалог 1:1 с собеседником → аватар собеседника (не автора)', () => {
    const p = resolveInboxPreview(
      base({
        channel_type: 'web',
        thread_type: 'chat',
        last_message_at: '2026-07-01T10:00:00Z',
        counterpart_name: 'София',
        counterpart_avatar_url: 'c.jpg',
        last_sender_name: 'Я',
      }),
    )
    expect(p.avatarFallbackName).toBe('София')
    expect(p.avatarUrl).toBe('c.jpg')
  })

  it('email без собеседника → инициал по email_contact, без аватара', () => {
    const p = resolveInboxPreview(
      base({
        channel_type: 'email',
        counterpart_name: null,
        email_contact: 'a@b.com',
        last_message_at: '2026-07-01T10:00:00Z',
      }),
    )
    expect(p.avatarUrl).toBeNull()
    expect(p.avatarFallbackName).toBe('a@b.com')
  })
})
