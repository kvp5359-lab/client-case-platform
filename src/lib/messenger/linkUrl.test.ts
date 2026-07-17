import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { normalizeHref, countLinkSegments } from './linkUrl'

describe('normalizeHref', () => {
  it('пусто/пробелы → пустая строка', () => {
    expect(normalizeHref('')).toBe('')
    expect(normalizeHref('   ')).toBe('')
  })

  it('адрес без схемы получает https://', () => {
    expect(normalizeHref('site.ru')).toBe('https://site.ru')
    expect(normalizeHref('www.x.com')).toBe('https://www.x.com')
  })

  it('валидную схему не трогает', () => {
    expect(normalizeHref('https://x.io')).toBe('https://x.io')
    expect(normalizeHref('http://x.io')).toBe('http://x.io')
    expect(normalizeHref('mailto:a@b.com')).toBe('mailto:a@b.com')
    expect(normalizeHref('tel:+34123')).toBe('tel:+34123')
  })

  it('javascript: обезвреживается префиксом https://', () => {
    expect(normalizeHref('javascript:alert(1)')).toBe('https://javascript:alert(1)')
  })

  it('обрезает пробелы по краям', () => {
    expect(normalizeHref('  https://x.io  ')).toBe('https://x.io')
  })
})

function makeEditor(content: string): Editor {
  return new Editor({
    extensions: [StarterKit.configure({ link: false }), Link],
    content,
  })
}

function countAll(editor: Editor): number {
  const linkType = editor.state.schema.marks.link
  return countLinkSegments(editor.state.doc, 0, editor.state.doc.content.size, linkType)
}

describe('countLinkSegments', () => {
  it('нет ссылок → 0', () => {
    const e = makeEditor('<p>просто текст</p>')
    expect(countAll(e)).toBe(0)
    e.destroy()
  })

  it('одна ссылка → 1', () => {
    const e = makeEditor('<p>тест <a href="https://x.io">ссылка</a> хвост</p>')
    expect(countAll(e)).toBe(1)
    e.destroy()
  })

  it('две ссылки в разных абзацах на ОДИН адрес → 2', () => {
    const e = makeEditor(
      '<p>a <a href="https://x.io">l1</a></p><p>b <a href="https://x.io">l2</a></p>',
    )
    expect(countAll(e)).toBe(2)
    e.destroy()
  })

  it('две ссылки, разделённые текстом → 2', () => {
    const e = makeEditor(
      '<p><a href="https://x.io">l1</a> и <a href="https://y.io">l2</a></p>',
    )
    expect(countAll(e)).toBe(2)
    e.destroy()
  })
})
