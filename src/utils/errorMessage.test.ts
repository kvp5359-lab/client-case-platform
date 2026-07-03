import { describe, it, expect } from 'vitest'
import { getUserFacingErrorMessage } from './errorMessage'

describe('getUserFacingErrorMessage', () => {
  it('маппит duplicate key на человеческий текст', () => {
    expect(getUserFacingErrorMessage(new Error('duplicate key value violates unique constraint "x"')))
      .toBe('Такая запись уже существует.')
  })

  it('маппит permission denied / RLS', () => {
    expect(getUserFacingErrorMessage(new Error('new row violates row-level security policy'))).toBe('Недостаточно прав для этого действия.')
    expect(getUserFacingErrorMessage('permission denied for table x')).toBe('Недостаточно прав для этого действия.')
  })

  it('маппит сетевые ошибки', () => {
    expect(getUserFacingErrorMessage(new Error('Failed to fetch'))).toBe('Проблема с сетью. Проверьте соединение и повторите.')
  })

  it('маппит истёкшую сессию', () => {
    expect(getUserFacingErrorMessage(new Error('JWT expired'))).toBe('Сессия истекла. Войдите заново.')
  })

  it('сохраняет уже человеческое русское сообщение', () => {
    expect(getUserFacingErrorMessage(new Error('Нельзя удалить последнего владельца'))).toBe('Нельзя удалить последнего владельца')
  })

  it('прячет сырой SQL/английский за fallback', () => {
    expect(getUserFacingErrorMessage(new Error('unexpected token in JSON at position 42'))).toBe('Произошла непредвиденная ошибка. Попробуйте ещё раз.')
    expect(getUserFacingErrorMessage({ nope: 1 })).toBe('Произошла непредвиденная ошибка. Попробуйте ещё раз.')
  })

  it('пустая ошибка → fallback', () => {
    expect(getUserFacingErrorMessage(null, 'мой fallback')).toBe('мой fallback')
  })

  it('[object Object]-подобное не пропускается', () => {
    expect(getUserFacingErrorMessage(new Error('[object Object]'))).toBe('Произошла непредвиденная ошибка. Попробуйте ещё раз.')
  })
})
