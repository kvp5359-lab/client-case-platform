import { describe, it, expect } from 'vitest'
import { resolveThreadChannel } from './resolveThreadChannel'

describe('resolveThreadChannel — единый канон маршрутизации (= SQL-триггер)', () => {
  it('пустой тред → internal', () => {
    expect(resolveThreadChannel({})).toBe('internal')
  })

  it.each([
    ['email по type', { type: 'email' }, 'email'],
    ['email по account_id', { email_send_account_id: 'acc1' }, 'email'],
    ['email по входящему internal', { hasEmailInternalMessage: true }, 'email'],
    ['mtproto', { mtproto_session_user_id: 'u1', mtproto_client_tg_user_id: 123 }, 'mtproto'],
    ['business', { business_connection_id: 'bc1' }, 'business'],
    ['wazzup', { wazzup_channel_id: 'ch1', wazzup_chat_id: '79990000000' }, 'wazzup'],
    ['telegram_group', { hasTelegramGroupChat: true }, 'telegram_group'],
  ])('%s → %s', (_l, signals, expected) => {
    expect(resolveThreadChannel(signals)).toBe(expected)
  })

  it('mtproto без client_tg_user_id → НЕ mtproto (нужны оба поля)', () => {
    expect(resolveThreadChannel({ mtproto_session_user_id: 'u1' })).toBe('internal')
  })

  it('wazzup без chat_id → НЕ wazzup (нужны оба поля)', () => {
    expect(resolveThreadChannel({ wazzup_channel_id: 'ch1' })).toBe('internal')
  })

  // Канон приоритета: если тред (гипотетически) получил несколько признаков,
  // порядок обязан совпадать с SQL-триггером email→mtproto→business→wazzup→tg.
  it('приоритет email над всеми', () => {
    expect(resolveThreadChannel({
      type: 'email', mtproto_session_user_id: 'u1', mtproto_client_tg_user_id: 1,
      business_connection_id: 'b', wazzup_channel_id: 'c', wazzup_chat_id: 'x',
      hasTelegramGroupChat: true,
    })).toBe('email')
  })
  it('приоритет mtproto над business/wazzup/tg', () => {
    expect(resolveThreadChannel({
      mtproto_session_user_id: 'u1', mtproto_client_tg_user_id: 1,
      business_connection_id: 'b', wazzup_channel_id: 'c', wazzup_chat_id: 'x',
      hasTelegramGroupChat: true,
    })).toBe('mtproto')
  })
  it('приоритет business над wazzup/tg', () => {
    expect(resolveThreadChannel({
      business_connection_id: 'b', wazzup_channel_id: 'c', wazzup_chat_id: 'x',
      hasTelegramGroupChat: true,
    })).toBe('business')
  })
  it('приоритет wazzup над tg', () => {
    expect(resolveThreadChannel({
      wazzup_channel_id: 'c', wazzup_chat_id: 'x', hasTelegramGroupChat: true,
    })).toBe('wazzup')
  })
})
