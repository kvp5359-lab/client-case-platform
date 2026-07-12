/**
 * Регрессия под Фазу 2.1 аудита безопасности: saveDraftMessage ОБЯЗАН писать
 * visibility/notify_subscribers в INSERT. Иначе черновик получает DEFAULT
 * 'client', и внутреннее сообщение (Команде/Заметка/Только я), сохранённое
 * как черновик или запланированное, утекает клиенту при публикации.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { saveDraftMessage } from './messengerDraftService'
import { supabase } from '@/lib/supabase'

type SupabaseFrom = ReturnType<typeof supabase.from>

vi.mock('@/lib/supabase')

function mockInsertReturningRow() {
  const row = {
    id: 'msg-1',
    thread_id: 'thread-1',
    workspace_id: 'ws-1',
    project_id: null,
    content: 'секрет для команды',
    sender_participant_id: 'p-1',
    sender_name: 'Кирилл',
    sender_role: 'Администратор',
    source: 'web',
    channel: 'client',
    is_draft: true,
    has_attachments: false,
    created_at: '2026-07-12T00:00:00Z',
  }
  const single = vi.fn().mockResolvedValue({ data: row, error: null })
  const select = vi.fn().mockReturnValue({ single })
  const insert = vi.fn().mockReturnValue({ select })
  vi.mocked(supabase.from).mockReturnValue({ insert } as unknown as SupabaseFrom)
  return insert
}

const baseParams = {
  workspaceId: 'ws-1',
  content: 'секрет для команды',
  senderParticipantId: 'p-1',
  senderName: 'Кирилл',
  senderRole: 'Администратор' as const,
  threadId: 'thread-1',
}

describe('saveDraftMessage — visibility в INSERT', () => {
  beforeEach(() => vi.clearAllMocks())

  it('пишет переданные visibility=team и notifySubscribers=false', async () => {
    const insert = mockInsertReturningRow()
    await saveDraftMessage({ ...baseParams, visibility: 'team', notifySubscribers: false })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'team', notify_subscribers: false }),
    )
  })

  it('пишет visibility=self', async () => {
    const insert = mockInsertReturningRow()
    await saveDraftMessage({ ...baseParams, visibility: 'self', notifySubscribers: true })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'self' }))
  })

  it('дефолт client/true, когда visibility не передан (клиентский черновик)', async () => {
    const insert = mockInsertReturningRow()
    await saveDraftMessage(baseParams)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'client', notify_subscribers: true }),
    )
  })
})
