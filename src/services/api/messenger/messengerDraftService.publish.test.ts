/**
 * D3.1 (гибрид): publishDraftMessage доставляет через канонический серверный
 * диспетчер deliver_message (текст + не-email вложения + гейт visibility в БД),
 * а email-вложения дошлёт фронт-invoke с гейтом isClientVisible (этот путь
 * минует серверный гейт — защита от утечки 2026-07-08).
 *
 * Проверяем: (1) deliver_message зовётся всегда; (2) email-вложения client →
 * фронт-invoke email-internal-send; (3) email-вложения team → НЕ шлём (гейт);
 * (4) не-email тред → email-invoke не зовётся (его доставил deliver_message).
 * Серверный гейт visibility для не-email покрыт смоком internal-vis + SQL-тестом
 * dispatch, здесь не дублируется.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn()
const invokeMock = vi.fn()
const fromMock = vi.fn()
const getSessionMock = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    from: (...a: unknown[]) => fromMock(...a),
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
    auth: { getSession: (...a: unknown[]) => getSessionMock(...a) },
  },
}))
vi.mock('./messengerService.helpers', async (orig) => ({
  ...(await orig<typeof import('./messengerService.helpers')>()),
  hydrateReplyMessages: vi.fn().mockResolvedValue(undefined),
}))

import { publishDraftMessage } from './messengerDraftService'

function setup(opts: {
  visibility?: string
  withAttachment?: boolean
  emailThread?: boolean
  /** В треде есть входящее письмо — сервер считает такой тред почтовым даже
   *  без привязки Gmail-аккаунта (миграция 20260721140000). */
  hasIncomingEmail?: boolean
}) {
  rpcMock.mockResolvedValue({ error: null })
  invokeMock.mockResolvedValue({ data: null, error: null })
  getSessionMock.mockResolvedValue({ data: { session: null } })
  const messageRow = {
    id: 'm1', thread_id: 't1', project_id: 'p1', content: 'текст',
    visibility: opts.visibility ?? 'client', reply_to_message_id: null, channel: 'client',
    attachments: opts.withAttachment ? [{ id: 'a1' }] : [],
  }
  const threadRow = opts.emailThread
    ? { type: 'email', email_send_account_id: 'acc1' }
    : { type: 'chat', wazzup_channel_id: null, mtproto_session_user_id: null, business_connection_id: null }
  fromMock.mockImplementation((table: string) => {
    if (table === 'project_messages') {
      return {
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        select: (_cols: string, opts2?: { count?: string; head?: boolean }) =>
          opts2?.count
            ? // count-запрос «есть ли входящее письмо» (isEmailChannelThread)
              {
                eq: () => ({
                  eq: () =>
                    Promise.resolve({ count: opts.hasIncomingEmail ? 1 : 0, error: null }),
                }),
              }
            : { eq: () => ({ single: () => Promise.resolve({ data: messageRow, error: null }) }) },
      }
    }
    // project_threads
    return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: threadRow, error: null }) }) }) }
  })
}

describe('publishDraftMessage — доставка через deliver_message + email-вложения', () => {
  beforeEach(() => vi.clearAllMocks())

  it('всегда зовёт deliver_message (канонический диспетчер)', async () => {
    setup({})
    await publishDraftMessage('m1')
    expect(rpcMock).toHaveBeenCalledWith('deliver_message', { p_message_id: 'm1' })
  })

  it('без вложений → email-invoke не зовётся', async () => {
    setup({ withAttachment: false })
    await publishDraftMessage('m1')
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('email-тред + вложения + client → фронт-invoke email-internal-send', async () => {
    setup({ withAttachment: true, emailThread: true, visibility: 'client' })
    await publishDraftMessage('m1')
    expect(invokeMock).toHaveBeenCalledWith('email-internal-send', expect.anything())
  })

  it('email-тред + вложения + team → НЕ шлём (гейт утечки)', async () => {
    setup({ withAttachment: true, emailThread: true, visibility: 'team' })
    await publishDraftMessage('m1')
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('не-email тред + вложения → email-invoke не зовётся (доставил deliver_message)', async () => {
    setup({ withAttachment: true, emailThread: false, visibility: 'client' })
    await publishDraftMessage('m1')
    expect(invokeMock).not.toHaveBeenCalled()
  })

  // Регрессия 2026-07-22: тред без привязки Gmail-аккаунта, но с входящим
  // письмом, сервер считает почтовым — а фронт раньше нет, и вложения такого
  // письма молча не доезжали (ни при отправке, ни при повторе).
  it('тред без привязки, но с входящим письмом → email-invoke зовётся', async () => {
    setup({ withAttachment: true, emailThread: false, hasIncomingEmail: true, visibility: 'client' })
    await publishDraftMessage('m1')
    expect(invokeMock).toHaveBeenCalledWith('email-internal-send', expect.anything())
  })
})
