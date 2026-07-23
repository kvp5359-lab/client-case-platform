import { describe, it, expect } from 'vitest'
import { isMutePiercingMessage } from './mutePiercing'

const ME = 'a1b2c3d4-0000-0000-0000-000000000001'
const OTHER = 'a1b2c3d4-0000-0000-0000-000000000002'

describe('isMutePiercingMessage', () => {
  it('@упоминание меня (mention-узел с моим data-id) — пробивает', () => {
    const msg = {
      content: `<p>Привет <span data-type="mention" data-id="${ME}" data-label="Кирилл">@Кирилл</span>, глянь</p>`,
    }
    expect(isMutePiercingMessage(msg, ME)).toBe(true)
  })

  it('упоминание ДРУГОГО — не пробивает', () => {
    const msg = {
      content: `<p><span data-type="mention" data-id="${OTHER}">@Анна</span> привет</p>`,
    }
    expect(isMutePiercingMessage(msg, ME)).toBe(false)
  })

  it('ответ на МОЁ сообщение — пробивает', () => {
    const msg = {
      content: '<p>да, согласен</p>',
      reply_to_message: { sender_participant_id: ME },
    }
    expect(isMutePiercingMessage(msg, ME)).toBe(true)
  })

  it('ответ на чужое — не пробивает', () => {
    const msg = {
      content: '<p>да</p>',
      reply_to_message: { sender_participant_id: OTHER },
    }
    expect(isMutePiercingMessage(msg, ME)).toBe(false)
  })

  it('обычное сообщение без упоминаний/ответа — не пробивает', () => {
    expect(isMutePiercingMessage({ content: '<p>просто текст</p>' }, ME)).toBe(false)
  })

  it('текстовое «@Имя» без mention-узла — не упоминание (как и в БД)', () => {
    expect(isMutePiercingMessage({ content: '<p>@Кирилл посмотри</p>' }, ME)).toBe(false)
  })

  it('без моего participant_id — ничего не пробивает', () => {
    const msg = { content: `<span data-id="${ME}">x</span>` }
    expect(isMutePiercingMessage(msg, null)).toBe(false)
  })
})
