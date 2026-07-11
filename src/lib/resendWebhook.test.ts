import { describe, it, expect } from 'vitest'
import { stripHtmlQuotes } from './resendWebhook'

describe('stripHtmlQuotes', () => {
  it('снимает обёртки html/head/body и сохраняет текст (один документ)', () => {
    const html =
      '<html><head><style>.x{color:red}</style></head>' +
      '<body class="">Hola Kirill,<div>Genial</div></body></html>'
    const out = stripHtmlQuotes(html)
    expect(out).toContain('Hola Kirill,')
    expect(out).toContain('Genial')
    expect(out).not.toContain('<body')
    expect(out).not.toContain('<style')
  })

  it('вырезает <blockquote>-цитату, оставляя основной текст', () => {
    const html =
      '<html><body>Текст ответа<blockquote type="cite">Старая цитата</blockquote></body></html>'
    const out = stripHtmlQuotes(html)
    expect(out).toContain('Текст ответа')
    expect(out).not.toContain('Старая цитата')
  })

  it('вырезает gmail_quote-контейнер до конца', () => {
    const html =
      '<html><body>Мой ответ<div class="gmail_quote">процитированное письмо</div></body></html>'
    const out = stripHtmlQuotes(html)
    expect(out).toContain('Мой ответ')
    expect(out).not.toContain('процитированное письмо')
  })

  it('multipart Apple Mail: сохраняет текст ранних частей, режет цитату из последней', () => {
    // Несколько склеенных <html>-документов (как отдаёт Resend для multipart-письма).
    // Регрессия: жадный `^[\s\S]*<body>` съедал первую часть с текстом.
    const html =
      '<html><head><meta charset="utf-8"></head><body class="">Hola Kirill,' +
      '<div>Genial, muchas gracias.</div><div>Salut!</div>' +
      '<div>Toni Corral<br>COCO PLACE</div></body></html><br/>\n' +
      '<html><body><div id="AppleMailSignature"></div></body></html><br/>\n' +
      '<html><head></head><body><div><br>' +
      '<blockquote type="cite">El 1 jul 2026, Кирилл va escriure:' +
      '<div>¡Buenos días! He pagado.</div></blockquote></div></body></html>'
    const out = stripHtmlQuotes(html)
    expect(out).toContain('Hola Kirill,')
    expect(out).toContain('Genial, muchas gracias.')
    expect(out).toContain('Salut!')
    expect(out).toContain('Toni Corral')
    // цитата предыдущего письма удалена
    expect(out).not.toContain('¡Buenos días!')
    expect(out).not.toContain('va escriure')
    // не осталось тегов-обёрток
    expect(out).not.toContain('<body')
    expect(out).not.toContain('<html')
  })

  it('пустое тело (только обёртки/пустые div) не роняет функцию', () => {
    const html = '<html><body><div class=""></div><br></body></html>'
    const out = stripHtmlQuotes(html)
    expect(typeof out).toBe('string')
  })
})
