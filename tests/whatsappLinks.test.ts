/**
 * Ссылки в WhatsApp-каналах (WAHA/Wazzup).
 *
 * WhatsApp не поддерживает ссылки «под текстом» — кликабельным становится только
 * сам URL в тексте. До 2026-07-20 общий strip тегов срезал `<a>` вместе с href →
 * адрес пропадал МОЛЧА (клиент получал «Анкета для ВНЖ» без возможности открыть).
 * Эти тесты фиксируют, что адрес всегда доезжает.
 */
import { describe, it, expect } from 'vitest'
import { anchorsToText, htmlToWhatsApp } from '../supabase/functions/_shared/htmlFormatting'
import { stripHtmlBasic } from '../supabase/functions/_shared/channelText'

describe('anchorsToText', () => {
  it('текст ≠ адрес → «Текст: URL»', () => {
    expect(anchorsToText('<a href="https://ex.com/a">Анкета</a>')).toBe('Анкета: https://ex.com/a')
  })

  it('текст = адрес → только адрес (без дубля)', () => {
    expect(anchorsToText('<a href="https://ex.com/a">https://ex.com/a</a>')).toBe('https://ex.com/a')
  })

  it('текст = адрес без схемы → только адрес', () => {
    expect(anchorsToText('<a href="https://ex.com">ex.com</a>')).toBe('https://ex.com')
  })

  it('пустой текст → адрес', () => {
    expect(anchorsToText('<a href="https://ex.com"></a>')).toBe('https://ex.com')
  })

  it('&amp; в href декодируется', () => {
    expect(anchorsToText('<a href="https://ex.com/?a=1&amp;b=2">Ссылка</a>')).toBe(
      'Ссылка: https://ex.com/?a=1&b=2',
    )
  })

  it('несколько ссылок подряд', () => {
    expect(anchorsToText('<a href="https://a.com">A</a> и <a href="https://b.com">B</a>')).toBe(
      'A: https://a.com и B: https://b.com',
    )
  })

  it('вложенная разметка внутри текста ссылки не ломает', () => {
    expect(anchorsToText('<a href="https://ex.com"><strong>Жирная</strong></a>')).toBe(
      'Жирная: https://ex.com',
    )
  })
})

describe('WhatsApp-конвертеры сохраняют адрес', () => {
  it('htmlToWhatsApp (WAHA): список со ссылками', () => {
    const out = htmlToWhatsApp(
      '<ol><li><p><a href="https://ex.com/anketa">Анкета для ВНЖ</a></p></li>' +
        '<li><p><a href="https://drive.google.com/x">Папка проекта</a></p></li></ol>',
    )
    expect(out).toContain('Анкета для ВНЖ: https://ex.com/anketa')
    expect(out).toContain('Папка проекта: https://drive.google.com/x')
  })

  it('stripHtmlBasic (Wazzup): ссылка в абзаце', () => {
    expect(stripHtmlBasic('<p><a href="https://ex.com/a">Анкета</a></p>')).toBe(
      'Анкета: https://ex.com/a',
    )
  })
})
