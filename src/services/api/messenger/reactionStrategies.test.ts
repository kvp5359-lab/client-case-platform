/**
 * Тесты диспетчера стратегий реакций (Зона 6 рефакторинга).
 * Цель — зафиксировать, что для каждого `source` дёргается именно та
 * стратегия и Edge Function. Без этого легко промахнуться при
 * добавлении нового канала.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Мокаем supabase до импорта тестируемого модуля.
const invoke = vi.fn()
const rpc = vi.fn()
const select = vi.fn()
const eq = vi.fn()
const single = vi.fn()
const getSession = vi.fn()
const fromMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    rpc: (...a: unknown[]) => rpc(...a),
    from: (...a: unknown[]) => fromMock(...a),
    auth: { getSession: () => getSession() },
  },
}))

import { toggleReactionByChannel } from './reactionStrategies'

beforeEach(() => {
  invoke.mockReset()
  rpc.mockReset()
  select.mockReset()
  eq.mockReset()
  single.mockReset()
  getSession.mockReset()
  fromMock.mockReset()

  // Дефолтные стабы для цепочки .from().select().eq().single() —
  // используется в syncTelegramGroup.
  single.mockResolvedValue({ data: { telegram_message_id: null, telegram_chat_id: null } })
  eq.mockReturnValue({ single })
  select.mockReturnValue({ eq })
  fromMock.mockReturnValue({ select })
  getSession.mockResolvedValue({ data: { session: null } })
})

describe('toggleReactionByChannel', () => {
  const params = { messageId: 'm-1', participantId: 'p-1', emoji: '🔥' }

  it('telegram_business → invokes telegram-business-react', async () => {
    invoke.mockResolvedValue({ data: { added: true }, error: null })

    const res = await toggleReactionByChannel('telegram_business', params)

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('telegram-business-react', {
      body: { message_id: 'm-1', participant_id: 'p-1', emoji: '🔥' },
    })
    expect(res).toEqual({ added: true })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('telegram_mtproto → invokes telegram-mtproto-react', async () => {
    invoke.mockResolvedValue({ data: { added: false }, error: null })

    const res = await toggleReactionByChannel('telegram_mtproto', params)

    expect(invoke).toHaveBeenCalledWith('telegram-mtproto-react', {
      body: { message_id: 'm-1', participant_id: 'p-1', emoji: '🔥' },
    })
    expect(res).toEqual({ added: false })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('wazzup → RPC + при added=true дёргает wazzup-send-reaction', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    invoke.mockResolvedValue({ data: null, error: null })

    const res = await toggleReactionByChannel('wazzup', params)

    expect(rpc).toHaveBeenCalledWith('toggle_message_reaction', {
      p_message_id: 'm-1',
      p_participant_id: 'p-1',
      p_emoji: '🔥',
    })
    expect(res).toEqual({ added: true })

    // Дождёмся fire-and-forget hook'а внешнего sync'а.
    await new Promise((r) => setTimeout(r, 0))

    expect(invoke).toHaveBeenCalledWith('wazzup-send-reaction', {
      body: { message_id: 'm-1', emoji: '🔥' },
    })
  })

  it('wazzup → при added=false НЕ дёргает wazzup-send-reaction', async () => {
    rpc.mockResolvedValue({ data: false, error: null })

    const res = await toggleReactionByChannel('wazzup', params)
    expect(res).toEqual({ added: false })

    await new Promise((r) => setTimeout(r, 0))
    expect(invoke).not.toHaveBeenCalled()
  })

  it('default (web/group TG) → RPC + sync через telegram-set-reaction если есть TG-id', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    invoke.mockResolvedValue({ data: { ok: true }, error: null })
    single.mockResolvedValue({
      data: { telegram_message_id: 42, telegram_chat_id: 123 },
    })

    const res = await toggleReactionByChannel('web', params)

    expect(rpc).toHaveBeenCalled()
    expect(res).toEqual({ added: true })

    await new Promise((r) => setTimeout(r, 0))

    expect(invoke).toHaveBeenCalledWith('telegram-set-reaction', {
      body: {
        chat_id: 123,
        message_id: 42,
        reaction: [{ type: 'emoji', emoji: '🔥' }],
      },
    })
  })

  it('default + нет telegram_message_id → invoke НЕ дёргается', async () => {
    rpc.mockResolvedValue({ data: true, error: null })

    await toggleReactionByChannel('web', params)
    await new Promise((r) => setTimeout(r, 0))

    expect(invoke).not.toHaveBeenCalled()
  })

  it('RPC ошибка → ConversationError', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'rpc fail' } })

    await expect(toggleReactionByChannel('web', params)).rejects.toThrow(/rpc fail/)
  })
})
