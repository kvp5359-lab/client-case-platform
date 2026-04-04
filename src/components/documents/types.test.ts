/**
 * Тесты для утилит документов
 */

import { describe, it, expect } from 'vitest'
import { isStatusUnselected } from './types'

describe('isStatusUnselected', () => {
  it('должен вернуть true для null', () => {
    expect(isStatusUnselected(null)).toBe(true)
  })

  it('должен вернуть true для undefined', () => {
    expect(isStatusUnselected(undefined)).toBe(true)
  })

  it('должен вернуть true для пустой строки', () => {
    expect(isStatusUnselected('')).toBe(true)
  })

  it('должен вернуть true для строки из пробелов', () => {
    expect(isStatusUnselected('   ')).toBe(true)
  })

  it('должен вернуть true для строки с табами и переносами', () => {
    expect(isStatusUnselected('\t\n  ')).toBe(true)
  })

  it('должен вернуть false для непустой строки', () => {
    expect(isStatusUnselected('active')).toBe(false)
  })

  it('должен вернуть false для UUID', () => {
    expect(isStatusUnselected('123e4567-e89b-12d3-a456-426614174000')).toBe(false)
  })
})
