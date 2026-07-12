/**
 * Паритет-гард: три рантайма конвертят Tiptap-HTML в Telegram-HTML ОДИНАКОВО.
 * Edge (_shared) и mtproto (src/utils) — обе копии одной логики; исторически
 * mtproto-копия отстала (плоская нумерация вместо иерархической + игнор
 * <ol start=>), расхождение поймали только вручную (аудит 2026-07-12).
 * Этот тест валит CI, если копии снова разъедутся, + фиксирует корректность
 * нумерации. Держать рядом с любыми правками htmlFormatting.
 *
 * Оба файла — чистые строковые функции без Deno/Node-импортов, поэтому
 * импортируются напрямую в общий vitest.
 */
import { describe, it, expect } from 'vitest'
import {
  htmlToTelegramHtml as edgeToTg,
  escapeHtmlEntities as edgeEscape,
  isHtmlContent as edgeIsHtml,
} from '../supabase/functions/_shared/htmlFormatting'
import {
  htmlToTelegramHtml as mtprotoToTg,
  escapeHtmlEntities as mtprotoEscape,
  isHtmlContent as mtprotoIsHtml,
} from '../mtproto-service/src/utils/htmlFormatting'

const CASES: Array<{ name: string; html: string }> = [
  { name: 'plain', html: 'Привет, как дела?' },
  { name: 'bold+italic', html: '<strong>жирный</strong> и <em>курсив</em>' },
  { name: 'ordered list', html: '<ol><li><p>первый</p></li><li><p>второй</p></li></ol>' },
  { name: 'ordered list start=9', html: '<ol start="9"><li><p>девять</p></li><li><p>десять</p></li></ol>' },
  { name: 'unordered list', html: '<ul><li><p>раз</p></li><li><p>два</p></li></ul>' },
  {
    name: 'nested ordered',
    html: '<ol><li><p>один</p><ol><li><p>вложенный</p></li><li><p>второй вложенный</p></li></ol></li><li><p>два</p></li></ol>',
  },
  { name: 'headings', html: '<h1>Заголовок</h1><h2>Подзаголовок</h2><h3>Мелкий</h3>' },
  { name: 'blockquote', html: '<blockquote><p>цитата</p></blockquote>' },
  { name: 'paragraphs+br', html: '<p>строка1</p><p></p><p>строка2<br>перенос</p>' },
  { name: 'nbsp + entities', html: '<p>a&nbsp;b &amp; c</p>' },
  { name: 'link', html: '<a href="https://x.io">ссылка</a>' },
  {
    name: 'mixed doc',
    html: '<h2>План</h2><ol start="3"><li><p>третий</p></li><li><p>четвёртый</p><ul><li><p>под-буллет</p></li></ul></li></ol><p>итог</p>',
  },
]

describe('htmlFormatting: паритет edge ↔ mtproto', () => {
  for (const c of CASES) {
    it(`одинаковый вывод: ${c.name}`, () => {
      expect(mtprotoToTg(c.html)).toBe(edgeToTg(c.html))
    })
  }

  it('escapeHtmlEntities идентичен', () => {
    const s = 'a & b < c > d'
    expect(mtprotoEscape(s)).toBe(edgeEscape(s))
  })

  it('isHtmlContent идентичен', () => {
    for (const s of ['<b>x</b>', 'plain', '<p>y</p>', 'a < b математика']) {
      expect(mtprotoIsHtml(s)).toBe(edgeIsHtml(s))
    }
  })
})

describe('htmlFormatting: корректность нумерации (обе копии)', () => {
  for (const [label, fn] of [['edge', edgeToTg], ['mtproto', mtprotoToTg]] as const) {
    it(`${label}: <ol start=9> нумерует с 9`, () => {
      const out = fn('<ol start="9"><li><p>a</p></li><li><p>b</p></li></ol>')
      expect(out).toContain('9. a')
      expect(out).toContain('10. b')
    })
    it(`${label}: вложенный ol даёт иерархию 1.1`, () => {
      const out = fn('<ol><li><p>один</p><ol><li><p>вложен</p></li></ol></li></ol>')
      expect(out).toContain('1. один')
      expect(out).toContain('1.1. вложен')
    })
    it(`${label}: ul даёт буллеты`, () => {
      expect(fn('<ul><li><p>x</p></li></ul>')).toContain('• x')
    })
  }
})
