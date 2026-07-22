import { describe, it, expect } from 'vitest'
import { buildForwardContent } from './forwardContent'
import { sanitizeMessengerHtml } from '@/utils/format/messengerHtml'
import type { ForwardBufferItem } from '@/store/sidePanelStore'

const textItem = (content: string): ForwardBufferItem => ({
  id: 'buf-1',
  kind: 'text',
  sourceMessageId: 'msg-1',
  fromAuthorName: 'Аня',
  content,
  attachments: [],
})

describe('buildForwardContent — хвостовая пустота', () => {
  // Инвариант ledger 2026-07-16: бабл = редактор = пересылка 1:1. Бабл срезает
  // пустоту под последним текстом (sanitizeMessengerHtml), значит и пересылка
  // обязана — иначе в редактор уедут пустые строки, которых в баббле не видно.
  it('«Оригинал» срезает хвостовые пустые абзацы', () => {
    expect(buildForwardContent(textItem('<p>A</p><p></p><p><br></p>'), 'original')).toBe('<p>A</p>')
  })

  it('«Оригинал» совпадает с тем, что показывает бабл', () => {
    const raw = '<p>Текст.</p><p><br></p><p><br></p>'
    expect(buildForwardContent(textItem(raw), 'original')).toBe(sanitizeMessengerHtml(raw))
  })

  it('внутренние пустые строки при пересылке сохраняются', () => {
    expect(buildForwardContent(textItem('<p>A</p><p><br></p><p>B</p>'), 'original')).toBe(
      '<p>A</p><p><br></p><p>B</p>',
    )
  })

  it('«Цитата» тоже без хвостовой пустоты внутри blockquote', () => {
    expect(buildForwardContent(textItem('<p>A</p><p><br></p>'), 'quote')).toBe(
      '<blockquote><p>Переслано от <strong>Аня</strong></p><p>A</p></blockquote>',
    )
  })

  it('вложение без текста — пустая строка', () => {
    const fileItem: ForwardBufferItem = {
      id: 'buf-2',
      kind: 'file',
      sourceMessageId: 'msg-1',
      fromAuthorName: 'Аня',
      content: '',
      attachments: [],
    }
    expect(buildForwardContent(fileItem, 'original')).toBe('')
  })
})
