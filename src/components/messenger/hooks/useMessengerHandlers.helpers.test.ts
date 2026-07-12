import { describe, it, expect } from 'vitest'
import { totalAttachmentsSize, checkEmailAttachmentsLimit } from './useMessengerHandlers'

// Функции читают только .size — подсовываем File-подобные объекты с нужным
// размером, чтобы не аллоцировать реальные мегабайты.
const sized = (bytes: number) => ({ size: bytes }) as unknown as File
const MB = 1024 * 1024

describe('totalAttachmentsSize', () => {
  it('суммирует размеры', () => {
    expect(totalAttachmentsSize([sized(100), sized(250)])).toBe(350)
  })
  it('пустой список → 0', () => {
    expect(totalAttachmentsSize([])).toBe(0)
  })
})

describe('checkEmailAttachmentsLimit — гард 15 МБ на письмо', () => {
  it('в пределах лимита → ok', () => {
    const r = checkEmailAttachmentsLimit([sized(10 * MB)])
    expect(r.ok).toBe(true)
  })

  it('ровно 15 МБ → ok (граница включительно)', () => {
    expect(checkEmailAttachmentsLimit([sized(15 * MB)]).ok).toBe(true)
  })

  it('свыше 15 МБ → не ok + человекочитаемые МБ', () => {
    const r = checkEmailAttachmentsLimit([sized(15 * MB), sized(1 * MB)])
    expect(r.ok).toBe(false)
    expect(r.totalMb).toBe('16.0')
  })
})
