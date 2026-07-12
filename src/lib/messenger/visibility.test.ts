import { describe, it, expect } from 'vitest'
import { isClientVisibleForDelivery } from './visibility'

// Гейт внешней доставки вложений (баг-утечка 2026-07-08): внутреннее
// сообщение с файлом НЕ должно уходить клиенту в канал.
describe('isClientVisibleForDelivery — гейт внешней доставки вложений', () => {
  it("'client' → уходит клиенту", () => {
    expect(isClientVisibleForDelivery('client')).toBe(true)
  })

  it('null/undefined (дефолт) → трактуется как клиентское', () => {
    expect(isClientVisibleForDelivery(null)).toBe(true)
    expect(isClientVisibleForDelivery(undefined)).toBe(true)
  })

  it("'team' → НЕ уходит (внутреннее командное)", () => {
    expect(isClientVisibleForDelivery('team')).toBe(false)
  })

  it("'self' → НЕ уходит (личная заметка)", () => {
    expect(isClientVisibleForDelivery('self')).toBe(false)
  })

  it('любое НЕ-client значение → не уходит (fail-closed)', () => {
    for (const v of ['internal', 'note', 'unknown', '']) {
      expect(isClientVisibleForDelivery(v)).toBe(false)
    }
  })
})
