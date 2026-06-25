import { describe, it, expect } from 'vitest'
import { sanitizeMessengerHtml } from './messengerHtml'

/**
 * Проверка схлопывания пустых строк в email-HTML.
 * Маркетинговые письма часто валят пачки `<p>&nbsp;</p>` / `<div><br></div>`
 * между блоками — после санитизации они не должны давать более одной
 * пустой строки подряд.
 */
describe('sanitizeMessengerHtml — collapseEmptyLines', () => {
  // Считаем «видимые пустые строки» по количеству <br> подряд.
  // 1 <br> между блоками = нет пустой строки, 2 = 1 пустая, 3 = 2 пустые и т.д.
  const maxConsecutiveBr = (html: string): number => {
    let max = 0
    const re = /(?:<br\s*\/?>\s*)+/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      const count = (m[0].match(/<br/gi) ?? []).length
      if (count > max) max = count
    }
    return max
  }

  it('схлопывает <p>&nbsp;</p> подряд до одной пустой строки', () => {
    const dirty =
      '<p>Hello</p>' +
      '<p>&nbsp;</p>'.repeat(10) +
      '<p>World</p>'
    const out = sanitizeMessengerHtml(dirty)
    expect(maxConsecutiveBr(out)).toBeLessThanOrEqual(2)
    expect(out).toContain('Hello')
    expect(out).toContain('World')
  })

  it('схлопывает <div></div> подряд', () => {
    const dirty =
      '<div>A</div>' +
      '<div></div>'.repeat(8) +
      '<div>B</div>'
    const out = sanitizeMessengerHtml(dirty)
    expect(maxConsecutiveBr(out)).toBeLessThanOrEqual(2)
  })

  it('схлопывает <div><br></div> и <p><br></p>', () => {
    const dirty =
      '<p>A</p><p><br></p><p><br></p><p><br></p><p><br></p><p>B</p>'
    const out = sanitizeMessengerHtml(dirty)
    expect(maxConsecutiveBr(out)).toBeLessThanOrEqual(2)
  })

  it('схлопывает вложенные пустые: <div><span>&nbsp;</span></div>', () => {
    const dirty =
      '<p>A</p>' +
      '<div><span>&nbsp;</span></div>'.repeat(6) +
      '<p>B</p>'
    const out = sanitizeMessengerHtml(dirty)
    expect(maxConsecutiveBr(out)).toBeLessThanOrEqual(2)
  })

  it('схлопывает <br><br><br>... подряд', () => {
    const dirty = 'A' + '<br>'.repeat(20) + 'B'
    const out = sanitizeMessengerHtml(dirty)
    expect(maxConsecutiveBr(out)).toBeLessThanOrEqual(2)
  })

  it('не трогает блок с реальным текстом', () => {
    const dirty = '<p>Hello world</p>'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).toContain('Hello world')
    expect(out).toContain('<p>')
  })

  it('не считает блок с <img> пустым', () => {
    // <img> разрешит DOMPurify только если есть в whitelist — у нас его нет.
    // Поэтому реальная проверка — что блок с осмысленным текстом
    // (включая ссылку) не схлопывается.
    const dirty = '<p><a href="https://x.com">link</a></p>'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).toContain('href="https://x.com"')
  })

  it('сохраняет 1 пустую строку между абзацами (не схлопывает в 0)', () => {
    const dirty = '<p>A</p><p>&nbsp;</p><p>B</p>'
    const out = sanitizeMessengerHtml(dirty)
    // Должен остаться хотя бы один <br> или пустой блок-разделитель.
    expect(out).toMatch(/<br|<p[^>]*><\/p>|<div[^>]*><\/div>/)
  })

  it('обрезает хвостовую пустоту email (br/nbsp/пустой блок в конце)', () => {
    // Так заканчивается тело входящего email (Gmail): текст + <br><br><br> +
    // &nbsp; + пустой mail-quote-collapse div (класс вычищает DOMPurify).
    const dirty = 'Текст.<br><br><br>&nbsp;<div class="mail-quote-collapse"></div>'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).toBe('Текст.')
  })

  it('обрезает начальную пустоту', () => {
    const dirty = '<br>&nbsp;<br>Текст'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).toBe('Текст')
  })

  it('разворачивает вложенные одно-ячеечные layout-таблицы письма в div', () => {
    // Stripe/marketing-письма оборачивают каждую строку в свою таблицу,
    // вложенную на несколько уровней → накопленный левый отступ и зазоры.
    const dirty =
      '<table><tbody><tr><td><table><tbody><tr><td>' +
      '<span>Строка</span>' +
      '</td></tr></tbody></table></td></tr></tbody></table>'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).not.toContain('<table')
    expect(out).toContain('Строка')
  })

  it('сохраняет реальную таблицу данных (2+ ячейки в строке)', () => {
    const dirty =
      '<table><tbody><tr><td>Итого</td><td>$12.14</td></tr></tbody></table>'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).toContain('<table')
    expect(out).toContain('Итого')
    expect(out).toContain('$12.14')
  })

  it('вычищает preheader-распорки (soft hyphen / zero-width) и сворачивает блок', () => {
    // preheader письма: невидимые символы между пробелами создают высокий
    // пустой бокс + артефакт «-» (soft hyphen). После чистки блок пуст.
    const dirty =
      '<div>­ ­ ͏ ​ ­ ‍</div><div>Текст</div>'
    const out = sanitizeMessengerHtml(dirty)
    expect(out).not.toContain('­')
    expect(out).not.toContain('͏')
    expect(out).not.toContain('​')
    expect(out).toContain('Текст')
  })
  it('конвертирует пробелы фиксированной ширины (figure space U+2007) в обычные', () => {
    // Stripe-письма набивают preheader figure-space (U+2007) — он НЕ схлопывается
    // под white-space:normal, сотня штук даёт высокий пустой бокс.
    const figureSpaces = '\u2007'.repeat(50)
    const dirty = `<span>Тема${figureSpaces}конец</span>`
    const out = sanitizeMessengerHtml(dirty)
    expect(out).not.toContain('\u2007')
    expect(out).toContain('Тема')
    expect(out).toContain('конец')
  })

})
