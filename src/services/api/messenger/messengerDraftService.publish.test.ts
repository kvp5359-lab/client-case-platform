/**
 * Регрессия под инцидент утечки 2026-07-08 (worst-case): публикация черновика
 * ОБЯЗАНА уходить во внешний канал ТОЛЬКО для visibility='client'. Внутренние
 * (team/self) остаются в сервисе — иначе внутреннее сообщение/файл утекает
 * клиенту в Telegram. Это единственная автопроверка гейта publishDraftMessage
 * (снижает bus factor — грабля больше не «в голове»).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Полный мок клиента через фабрику: supabase.functions — getter-only в
// supabase-js, присвоить его автомоку нельзя, поэтому задаём shape сами.
const invokeMock = vi.fn()
const fromMock = vi.fn()
const getSessionMock = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...a: unknown[]) => fromMock(...a),
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
    auth: { getSession: (...a: unknown[]) => getSessionMock(...a) },
  },
}))
// hydrateReplyMessages делает свои запросы — глушим, остальное (cast, SELECT) реально.
vi.mock('./messengerService.helpers', async (orig) => ({
  ...(await orig<typeof import('./messengerService.helpers')>()),
  hydrateReplyMessages: vi.fn().mockResolvedValue(undefined),
}))

import { publishDraftMessage } from './messengerDraftService'

function setup(visibility: string | null) {
  invokeMock.mockResolvedValue({ data: null, error: null })
  getSessionMock.mockResolvedValue({ data: { session: null } })
  const messageRow = {
    id: 'm1', thread_id: 't1', project_id: 'p1', content: 'внутренний секрет',
    visibility, reply_to_message_id: null, channel: 'client', attachments: [],
  }
  fromMock.mockImplementation((table: string) => {
    if (table === 'project_messages') {
      return {
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: messageRow, error: null }) }) }),
      }
    }
    // project_telegram_chats: select → eq(is_active) → eq(thread_id) → maybeSingle
    return {
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { telegram_chat_id: 999 }, error: null }) }) }) }),
    }
  })
  return invokeMock
}

describe('publishDraftMessage — гейт внешней доставки по visibility', () => {
  beforeEach(() => vi.clearAllMocks())

  it("visibility='team' → НЕ уходит в канал (нет invoke telegram-send)", async () => {
    const invoke = setup('team')
    await publishDraftMessage('m1', 'Кирилл', 'Администратор')
    expect(invoke).not.toHaveBeenCalled()
  })

  it("visibility='self' → НЕ уходит в канал", async () => {
    const invoke = setup('self')
    await publishDraftMessage('m1', 'Кирилл', 'Администратор')
    expect(invoke).not.toHaveBeenCalled()
  })

  it("visibility='client' → уходит (invoke telegram-send-message)", async () => {
    const invoke = setup('client')
    await publishDraftMessage('m1', 'Кирилл', 'Администратор')
    expect(invoke).toHaveBeenCalledWith('telegram-send-message', expect.anything())
  })

  it('visibility=null трактуется как client → уходит (обратная совместимость)', async () => {
    const invoke = setup(null)
    await publishDraftMessage('m1', 'Кирилл', 'Администратор')
    expect(invoke).toHaveBeenCalledWith('telegram-send-message', expect.anything())
  })
})
