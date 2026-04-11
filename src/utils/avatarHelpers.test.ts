import { describe, it, expect } from 'vitest'
import { getInitials, getEmailInitials, getAvatarColor } from './avatarHelpers'

describe('getInitials', () => {
  it('возвращает "?" для пустой строки', () => {
    expect(getInitials('')).toBe('?')
  })

  it('возвращает первую букву одного слова', () => {
    expect(getInitials('Иван')).toBe('И')
  })

  it('возвращает две буквы из имени и фамилии', () => {
    expect(getInitials('Иван Петров')).toBe('ИП')
  })

  it('берёт только первые два слова', () => {
    expect(getInitials('Иван Иванович Петров')).toBe('ИИ')
  })

  it('верхний регистр', () => {
    expect(getInitials('иван петров')).toBe('ИП')
  })

  it('игнорирует двойные пробелы', () => {
    expect(getInitials('Иван  Петров')).toBe('ИП')
  })

  it('работает с латиницей', () => {
    expect(getInitials('John Smith')).toBe('JS')
  })
})

describe('getEmailInitials', () => {
  it('возвращает "??" для undefined', () => {
    expect(getEmailInitials(undefined)).toBe('??')
  })

  it('возвращает первые два символа до @', () => {
    expect(getEmailInitials('john@example.com')).toBe('JO')
  })

  it('верхний регистр', () => {
    expect(getEmailInitials('alice@test.com')).toBe('AL')
  })

  it('обрабатывает короткие email', () => {
    expect(getEmailInitials('a@b.c')).toBe('A')
  })
})

describe('getAvatarColor', () => {
  it('возвращает строку с tailwind-классами', () => {
    const color = getAvatarColor('Иван')
    expect(typeof color).toBe('string')
    expect(color).toMatch(/bg-\w+-100 text-\w+-700/)
  })

  it('одинаковые имена → одинаковый цвет (стабильность)', () => {
    expect(getAvatarColor('Иван Петров')).toBe(getAvatarColor('Иван Петров'))
  })

  it('разные имена обычно → разные цвета (на широкой выборке)', () => {
    const colors = new Set(
      ['Alice', 'Bob', 'Charlie', 'David', 'Eve', 'Frank', 'Grace', 'Henry'].map(
        getAvatarColor
      )
    )
    // Палитра — 8 цветов, не ожидаем что все 8 уникальны, но хотя бы 3
    expect(colors.size).toBeGreaterThanOrEqual(3)
  })
})
