import { describe, it, expect } from 'vitest'
import { hasComposerPayload } from './composerContent'

describe('hasComposerPayload', () => {
  it('пустой композер — отправлять нечего', () => {
    expect(hasComposerPayload({ hasText: false, fileCount: 0, forwardedCount: 0 })).toBe(false)
  })

  it('только текст', () => {
    expect(hasComposerPayload({ hasText: true, fileCount: 0, forwardedCount: 0 })).toBe(true)
  })

  it('только свежий файл', () => {
    expect(hasComposerPayload({ hasText: false, fileCount: 1, forwardedCount: 0 })).toBe(true)
  })

  // Регрессия 2026-07-22: пересылаешь один файл без текста — кнопка активна,
  // а handleSend молча выходил, потому что считал контент только по тексту и
  // локальным файлам. Приходилось дописывать любой текст, чтобы отправилось.
  it('только пересланный файл, без текста — отправлять есть что', () => {
    expect(hasComposerPayload({ hasText: false, fileCount: 0, forwardedCount: 1 })).toBe(true)
  })

  it('пересланный файл вместе с текстом', () => {
    expect(hasComposerPayload({ hasText: true, fileCount: 0, forwardedCount: 3 })).toBe(true)
  })
})
