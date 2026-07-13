import { describe, it, expect } from 'vitest'
import { humanizeSendError } from './sendErrorMessages'

describe('humanizeSendError', () => {
  it('окно 24ч Telegram Business (BUSINESS_PEER_USAGE_MISSING)', () => {
    const r = humanizeSendError('Bad Request: BUSINESS_PEER_USAGE_MISSING')
    expect(r).toMatch(/24 час/)
    expect(r).toMatch(/вручную/)
  })

  it('BUSINESS_CHAT_INACTIVE — тот же 24ч-текст', () => {
    expect(humanizeSendError('BUSINESS_CHAT_INACTIVE')).toMatch(/24 час/)
  })

  it('PEER_ID_INVALID — мягкая подсказка про 24ч/доступ', () => {
    expect(humanizeSendError('Bad Request: PEER_ID_INVALID')).toMatch(/вручную|24/)
  })

  it('бот кикнут из группы', () => {
    expect(humanizeSendError('Bad Request: chat not found')).toMatch(/группе|доступ/)
    expect(humanizeSendError('Forbidden: bot was kicked from the group chat')).toMatch(/группе|доступ/)
  })

  it('нет прав', () => {
    expect(humanizeSendError('Bad Request: not enough rights to send text messages')).toMatch(/прав/)
  })

  it('большой файл', () => {
    expect(humanizeSendError('Request Entity Too Large: file is too big')).toMatch(/20 МБ|большой/)
  })

  it('rate limit', () => {
    expect(humanizeSendError('Too Many Requests: retry after 5')).toMatch(/подожд|подряд/)
  })

  it('неизвестная ошибка → null (UI покажет дефолт)', () => {
    expect(humanizeSendError('Something totally unexpected')).toBeNull()
    expect(humanizeSendError(null)).toBeNull()
    expect(humanizeSendError('')).toBeNull()
  })
})
