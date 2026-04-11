import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from './sanitizeHtml'

describe('sanitizeHtml', () => {
  it('пропускает безопасный текст', () => {
    expect(sanitizeHtml('hello world')).toBe('hello world')
  })

  it('пропускает безопасные теги', () => {
    expect(sanitizeHtml('<p>hello</p>')).toBe('<p>hello</p>')
    expect(sanitizeHtml('<strong>bold</strong>')).toBe('<strong>bold</strong>')
  })

  it('удаляет <script>', () => {
    const dirty = '<p>safe</p><script>alert("xss")</script>'
    const clean = sanitizeHtml(dirty)
    expect(clean).not.toContain('<script>')
    expect(clean).not.toContain('alert')
    expect(clean).toContain('<p>safe</p>')
  })

  it('удаляет inline-обработчики событий', () => {
    const dirty = '<img src="x" onerror="alert(1)">'
    const clean = sanitizeHtml(dirty)
    expect(clean).not.toContain('onerror')
  })

  it('удаляет javascript: URL', () => {
    const dirty = '<a href="javascript:alert(1)">click</a>'
    const clean = sanitizeHtml(dirty)
    expect(clean).not.toContain('javascript:')
  })

  it('сохраняет атрибут target на ссылках', () => {
    const dirty = '<a href="https://example.com" target="_blank">link</a>'
    const clean = sanitizeHtml(dirty)
    expect(clean).toContain('target="_blank"')
  })

  it('сохраняет атрибут rel на ссылках', () => {
    const dirty = '<a href="https://example.com" rel="noopener">link</a>'
    const clean = sanitizeHtml(dirty)
    expect(clean).toContain('rel="noopener"')
  })

  it('возвращает пустую строку для пустого ввода', () => {
    expect(sanitizeHtml('')).toBe('')
  })
})
