import { describe, it, expect } from 'vitest'
import { mergeAlbumMessages } from './mergeAlbumMessages'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import type { MessageAttachment } from '@/services/api/messenger/messengerService.types'

function att(name: string): MessageAttachment {
  return {
    id: `att-${name}`,
    message_id: 'x',
    file_name: name,
    file_size: 1,
    mime_type: 'application/pdf',
    storage_path: `p/${name}`,
    telegram_file_id: null,
    transcription: null,
    file_id: `f-${name}`,
    created_at: '2026-07-12T18:47:09Z',
  }
}

function msg(over: Partial<ProjectMessage>): ProjectMessage {
  return {
    id: 'm',
    project_id: 'proj',
    workspace_id: 'ws',
    sender_participant_id: 'sp',
    sender_name: 'Клиент',
    sender_role: 'Telegram',
    content: '📎',
    source: 'telegram',
    reply_to_message_id: null,
    reply_to_message: null,
    telegram_message_id: 1,
    telegram_message_ids: [1],
    telegram_chat_id: -100,
    telegram_sender_user_id: 34068591,
    telegram_message_date: '2026-07-12T18:47:09+00:00',
    telegram_grouped_id: null,
    telegram_attachments_delivered: null,
    is_edited: false,
    is_draft: false,
    forwarded_from_name: null,
    forwarded_date: null,
    scheduled_send_at: null,
    channel: 'client',
    thread_id: 't',
    email_metadata: null,
    send_status: 'sent',
    created_at: '2026-07-12T18:47:09Z',
    updated_at: '2026-07-12T18:47:09Z',
    reactions: [],
    attachments: [],
    sender: null,
    ...over,
  }
}

describe('mergeAlbumMessages', () => {
  it('склеивает 3 файла одного альбома в одну запись с 3 вложениями', () => {
    const input = [
      msg({ id: 'a', telegram_message_id: 2334, telegram_message_ids: [2334], telegram_grouped_id: '14271056237906106', attachments: [att('doc1')] }),
      msg({ id: 'b', telegram_message_id: 2335, telegram_message_ids: [1666, 2335], telegram_grouped_id: '14271056237906106', attachments: [att('doc2')] }),
      msg({ id: 'c', telegram_message_id: 2336, telegram_message_ids: [2336], telegram_grouped_id: '14271056237906106', attachments: [att('doc3')] }),
    ]
    const out = mergeAlbumMessages(input)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('a') // базой берём первый
    expect(out[0].attachments.map((a) => a.file_name)).toEqual(['doc1', 'doc2', 'doc3'])
    expect(out[0].telegram_message_ids).toEqual([2334, 1666, 2335, 2336])
  })

  it('не мутирует исходные объекты', () => {
    const first = msg({ id: 'a', telegram_grouped_id: 'G', attachments: [att('d1')] })
    const second = msg({ id: 'b', telegram_grouped_id: 'G', attachments: [att('d2')] })
    mergeAlbumMessages([first, second])
    expect(first.attachments).toHaveLength(1)
    expect(second.attachments).toHaveLength(1)
  })

  it('подтягивает caption с файла, где он есть', () => {
    const out = mergeAlbumMessages([
      msg({ id: 'a', telegram_grouped_id: 'G', content: '📎', attachments: [att('d1')] }),
      msg({ id: 'b', telegram_grouped_id: 'G', content: 'Вот документы', attachments: [att('d2')] }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].content).toBe('Вот документы')
  })

  it('НЕ склеивает обычные сообщения без grouped_id (в т.ч. в одну секунду)', () => {
    const out = mergeAlbumMessages([
      msg({ id: 'a', telegram_grouped_id: null, attachments: [att('d1')] }),
      msg({ id: 'b', telegram_grouped_id: null, attachments: [att('d2')] }),
    ])
    expect(out).toHaveLength(2)
  })

  it('НЕ склеивает разные альбомы (разный date)', () => {
    const out = mergeAlbumMessages([
      msg({ id: 'a', telegram_grouped_id: 'G1', telegram_message_date: '2026-07-12T18:47:09+00:00', attachments: [att('d1')] }),
      msg({ id: 'b', telegram_grouped_id: 'G2', telegram_message_date: '2026-07-12T18:50:00+00:00', attachments: [att('d2')] }),
    ])
    expect(out).toHaveLength(2)
  })

  it('одиночная запись альбома (MTProto уже склеил в БД) — no-op', () => {
    const out = mergeAlbumMessages([
      msg({ id: 'a', source: 'telegram_mtproto', telegram_grouped_id: 'G', attachments: [att('d1'), att('d2')] }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].attachments).toHaveLength(2)
  })

  it('статус вложений группы — худший (failed > pending)', () => {
    const out = mergeAlbumMessages([
      msg({ id: 'a', telegram_grouped_id: 'G', attachment_status: null, attachments: [att('d1')] }),
      msg({ id: 'b', telegram_grouped_id: 'G', attachment_status: 'failed', attachments: [att('d2')] }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].attachment_status).toBe('failed')
  })
})
