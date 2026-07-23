import { describe, it, expect } from 'vitest'
import { isSourceUpdateUnread } from './sourceUpdates'

const EPOCH = '2026-07-10T00:00:00Z'

describe('isSourceUpdateUnread — зеркало серверной формулы get_source_update_unread_projects', () => {
  it('файл новее отметки прочтения — непрочитан', () => {
    expect(isSourceUpdateUnread('2026-07-20T10:00:00Z', '2026-07-15T00:00:00Z', EPOCH)).toBe(true)
  })

  it('файл старше отметки прочтения — прочитан', () => {
    expect(isSourceUpdateUnread('2026-07-12T10:00:00Z', '2026-07-15T00:00:00Z', EPOCH)).toBe(false)
  })

  it('отметки нет — сравнение с epoch (новее → непрочитан, старше → прочитан)', () => {
    expect(isSourceUpdateUnread('2026-07-20T10:00:00Z', null, EPOCH)).toBe(true)
    expect(isSourceUpdateUnread('2026-07-01T10:00:00Z', undefined, EPOCH)).toBe(false)
  })

  it('NULL created_at — не непрочитан (в SQL NULL не проходит `>`)', () => {
    expect(isSourceUpdateUnread(null, null, EPOCH)).toBe(false)
  })

  it('ровно на границе отметки — прочитан (строгое `>`)', () => {
    expect(
      isSourceUpdateUnread('2026-07-15T00:00:00Z', '2026-07-15T00:00:00Z', EPOCH),
    ).toBe(false)
  })
})
