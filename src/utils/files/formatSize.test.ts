import { describe, it, expect } from 'vitest'
import { formatSize } from './formatSize'

describe('formatSize', () => {
  it('возвращает "0 МБ" для null', () => {
    expect(formatSize(null)).toBe('0 МБ')
  })

  it('возвращает "0 МБ" для 0', () => {
    expect(formatSize(0)).toBe('0 МБ')
  })

  it('возвращает "0 МБ" для отрицательных чисел', () => {
    expect(formatSize(-100)).toBe('0 МБ')
  })

  it('форматирует 1 МБ корректно', () => {
    expect(formatSize(1024 * 1024)).toBe('1.00 МБ')
  })

  it('форматирует 2.5 МБ', () => {
    expect(formatSize(2.5 * 1024 * 1024)).toBe('2.50 МБ')
  })

  it('всегда два знака после запятой', () => {
    expect(formatSize(1024 * 1024 * 10)).toBe('10.00 МБ')
    expect(formatSize(1024 * 1024 * 0.5)).toBe('0.50 МБ')
  })

  it('маленькие файлы показываются дробью МБ', () => {
    expect(formatSize(1024)).toBe('0.00 МБ') // 1 КБ → 0.00 МБ при двух знаках
  })

  it('большие файлы корректно форматируются', () => {
    expect(formatSize(100 * 1024 * 1024)).toBe('100.00 МБ')
  })
})
