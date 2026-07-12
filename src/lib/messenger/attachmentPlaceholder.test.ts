import { describe, it, expect } from 'vitest'
import { ATTACHMENT_PLACEHOLDER, isAttachmentPlaceholder } from './attachmentPlaceholder'

describe('attachmentPlaceholder', () => {
  it('константа — символ скрепки 📎', () => {
    expect(ATTACHMENT_PLACEHOLDER).toBe('📎')
  })

  it('isAttachmentPlaceholder: true только на точном сентинеле', () => {
    expect(isAttachmentPlaceholder('📎')).toBe(true)
    expect(isAttachmentPlaceholder(ATTACHMENT_PLACEHOLDER)).toBe(true)
  })

  it('isAttachmentPlaceholder: false на тексте/пустоте/null', () => {
    expect(isAttachmentPlaceholder('привет')).toBe(false)
    expect(isAttachmentPlaceholder('📎 файл.pdf')).toBe(false) // декоративный, не сентинел
    expect(isAttachmentPlaceholder('')).toBe(false)
    expect(isAttachmentPlaceholder(null)).toBe(false)
    expect(isAttachmentPlaceholder(undefined)).toBe(false)
  })
})
