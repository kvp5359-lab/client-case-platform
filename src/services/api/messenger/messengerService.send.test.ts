import { describe, it, expect } from 'vitest'
import { shouldSplitTextAndFiles } from './messengerService.send'

// Хелпер: File-подобный объект (функция читает только количество, не содержимое).
const file = () => new File(['x'], 'f.txt')

describe('shouldSplitTextAndFiles — решение «текст отдельно + файлы отдельно»', () => {
  it('текст + 2 вложения → split', () => {
    expect(shouldSplitTextAndFiles({ content: 'привет', attachments: [file(), file()] })).toBe(true)
  })

  it('текст + 1 вложение → НЕ split (текст уходит как caption)', () => {
    expect(shouldSplitTextAndFiles({ content: 'привет', attachments: [file()] })).toBe(false)
  })

  it('текст без вложений → НЕ split', () => {
    expect(shouldSplitTextAndFiles({ content: 'привет' })).toBe(false)
  })

  it('2 вложения без текста → НЕ split', () => {
    expect(shouldSplitTextAndFiles({ content: '', attachments: [file(), file()] })).toBe(false)
  })

  it('пустой/пробельный/пустой-<p>/placeholder не считается текстом', () => {
    for (const content of ['', '   ', '<p></p>', '📎']) {
      expect(shouldSplitTextAndFiles({ content, attachments: [file(), file()] })).toBe(false)
    }
  })

  it('пересланные вложения учитываются в сумме (1 attach + 1 forwarded = 2)', () => {
    expect(
      shouldSplitTextAndFiles({
        content: 'текст',
        attachments: [file()],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        forwardedAttachments: [{ file_id: 'a' } as any],
      }),
    ).toBe(true)
  })

  it('2 пересланных вложения + текст → split', () => {
    expect(
      shouldSplitTextAndFiles({
        content: 'текст',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        forwardedAttachments: [{ file_id: 'a' } as any, { file_id: 'b' } as any],
      }),
    ).toBe(true)
  })
})
