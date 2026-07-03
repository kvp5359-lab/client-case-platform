import { describe, it, expect } from 'vitest'
// Тестируем edge-хелпер форматирования исходящих сообщений в Telegram.
// Файл самодостаточный (без импортов/Deno API), поэтому импортируется напрямую.
import { htmlToTelegramHtml } from '../../../supabase/functions/_shared/htmlFormatting'

describe('htmlToTelegramHtml — инлайн-форматирование', () => {
  it('<strong>/<em> → <b>/<i>', () => {
    expect(htmlToTelegramHtml('<strong>жир</strong> и <em>курс</em>')).toBe('<b>жир</b> и <i>курс</i>')
  })

  it('blockquote сохраняется', () => {
    expect(htmlToTelegramHtml('<blockquote>цитата</blockquote>')).toContain('<blockquote>цитата</blockquote>')
  })

  it('неподдерживаемые теги вырезаются, текст остаётся', () => {
    expect(htmlToTelegramHtml('<span class="x">текст</span>')).toBe('текст')
  })

  it('&nbsp; → обычный пробел', () => {
    expect(htmlToTelegramHtml('a&nbsp;b')).toBe('a b')
  })

  it('<p> → перевод строки, хвостовые \\n убираются', () => {
    expect(htmlToTelegramHtml('<p>раз</p><p>два</p>')).toBe('раз\nдва')
  })
})

describe('htmlToTelegramHtml — маркированные списки', () => {
  it('<ul> → маркеры •', () => {
    expect(htmlToTelegramHtml('<ul><li>a</li><li>b</li></ul>')).toBe('• a\n• b')
  })
})

describe('htmlToTelegramHtml — нумерованные списки (регрессия start)', () => {
  it('обычный <ol> нумерует с 1', () => {
    expect(htmlToTelegramHtml('<ol><li>a</li><li>b</li></ol>')).toBe('1. a\n2. b')
  })

  it('🔴 <ol start="9"> продолжает нумерацию с 9 (баг, ломавший клиентам 17 дней)', () => {
    expect(htmlToTelegramHtml('<ol start="9"><li>девять</li><li>десять</li></ol>')).toBe('9. девять\n10. десять')
  })

  it('два списка подряд: 1-2, затем 9-10 (сценарий из ledger)', () => {
    const html = '<ol><li>a</li><li>b</li></ol><ol start="9"><li>i</li><li>j</li></ol>'
    expect(htmlToTelegramHtml(html)).toBe('1. a\n2. b\n9. i\n10. j')
  })

  it('вложенный <ol> нумеруется иерархически (1, 1.1, 1.2)', () => {
    const html = '<ol><li>верх<ol><li>под1</li><li>под2</li></ol></li></ol>'
    expect(htmlToTelegramHtml(html)).toBe('1. верх\n1.1. под1\n1.2. под2')
  })
})

describe('htmlToTelegramHtml — заголовки', () => {
  it('<h1> эмулируется через <b> с отбивкой', () => {
    expect(htmlToTelegramHtml('<h1>Заголовок</h1>')).toContain('<b>━━━ Заголовок ━━━</b>')
  })
  it('<h2> эмулируется через <b>▸', () => {
    expect(htmlToTelegramHtml('<h2>Раздел</h2>')).toContain('<b>▸ Раздел</b>')
  })
})
