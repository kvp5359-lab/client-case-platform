import { describe, it, expect } from 'vitest'
import { isClientFacingThread } from './isClientFacingThread'

describe('isClientFacingThread — единый признак клиентского треда', () => {
  it('нет сигналов → не клиентский', () => {
    expect(isClientFacingThread({})).toBe(false)
    expect(isClientFacingThread({
      hasClientParticipant: false, isTgGroupLinked: false, isEmailChat: false,
      isBusiness: false, isWazzup: false, isMtproto: false,
    })).toBe(false)
  })

  // Каждый канал по отдельности делает тред клиентским. Если регрессия уберёт
  // один из них — тест упадёт (так уже ломалась раскраска MTProto).
  it.each([
    ['hasClientParticipant', { hasClientParticipant: true }],
    ['isTgGroupLinked', { isTgGroupLinked: true }],
    ['isEmailChat', { isEmailChat: true }],
    ['isBusiness', { isBusiness: true }],
    ['isWazzup', { isWazzup: true }],
    ['isMtproto', { isMtproto: true }],
  ])('%s → клиентский', (_label, signals) => {
    expect(isClientFacingThread(signals)).toBe(true)
  })
})
