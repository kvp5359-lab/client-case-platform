import { describe, it, expect } from 'vitest'
import {
  getBadgeDisplay,
  getAggregateBadgeDisplay,
  calcThreadUnread,
  calcTotalUnread,
  formatBadgeCount,
  type ThreadUnreadFields,
} from './inboxUnread'

function thread(overrides: Partial<ThreadUnreadFields>): ThreadUnreadFields {
  return {
    unread_count: 0,
    has_unread_reaction: false,
    unread_reaction_count: 0,
    manually_unread: false,
    last_reaction_emoji: null,
    unread_event_count: 0,
    ...overrides,
  }
}

describe('getBadgeDisplay', () => {
  it('возвращает type:none для треда без активности', () => {
    expect(getBadgeDisplay(thread({}))).toEqual({ type: 'none' })
  })

  it('возвращает число для unread_count > 0', () => {
    expect(getBadgeDisplay(thread({ unread_count: 5 }))).toEqual({
      type: 'number',
      value: 5,
    })
  })

  it('добавляет +1 за одну реакцию к unread_count', () => {
    expect(
      getBadgeDisplay(
        thread({ unread_count: 3, has_unread_reaction: true, unread_reaction_count: 1 })
      )
    ).toEqual({ type: 'number', value: 4 })
  })

  it('суммирует несколько реакций с сообщениями', () => {
    expect(
      getBadgeDisplay(
        thread({ unread_count: 3, has_unread_reaction: true, unread_reaction_count: 2 })
      )
    ).toEqual({ type: 'number', value: 5 })
  })

  it('учитывает unread_event_count', () => {
    expect(
      getBadgeDisplay(thread({ unread_count: 2, unread_event_count: 3 }))
    ).toEqual({ type: 'number', value: 5 })
  })

  it('возвращает эмодзи для одной реакции без сообщений', () => {
    expect(
      getBadgeDisplay(
        thread({
          has_unread_reaction: true,
          unread_reaction_count: 1,
          last_reaction_emoji: '👍',
        })
      )
    ).toEqual({ type: 'emoji', value: '👍' })
  })

  it('возвращает число 2, если в треде 2 непрочитанные реакции без сообщений', () => {
    expect(
      getBadgeDisplay(
        thread({
          has_unread_reaction: true,
          unread_reaction_count: 2,
          last_reaction_emoji: '👍',
        })
      )
    ).toEqual({ type: 'number', value: 2 })
  })

  it('fallback на has_unread_reaction, если нет unread_reaction_count', () => {
    expect(
      getBadgeDisplay({
        unread_count: 0,
        has_unread_reaction: true,
        manually_unread: false,
        last_reaction_emoji: '🎉',
      })
    ).toEqual({ type: 'emoji', value: '🎉' })
  })

  it('возвращает точку для manually_unread без активности', () => {
    expect(getBadgeDisplay(thread({ manually_unread: true }))).toEqual({
      type: 'dot',
    })
  })

  it('число имеет приоритет над manually_unread', () => {
    expect(
      getBadgeDisplay(thread({ unread_count: 1, manually_unread: true }))
    ).toEqual({ type: 'number', value: 1 })
  })
})

describe('getAggregateBadgeDisplay', () => {
  it('возвращает type:none для пустого массива', () => {
    expect(getAggregateBadgeDisplay([])).toEqual({ type: 'none' })
  })

  it('возвращает type:none когда нет активности ни в одном треде', () => {
    expect(getAggregateBadgeDisplay([thread({}), thread({})])).toEqual({
      type: 'none',
    })
  })

  it('суммирует unread_count', () => {
    expect(
      getAggregateBadgeDisplay([
        thread({ unread_count: 3 }),
        thread({ unread_count: 2 }),
      ])
    ).toEqual({ type: 'number', value: 5 })
  })

  it('возвращает эмодзи когда единственный непрочитанный — одна реакция', () => {
    expect(
      getAggregateBadgeDisplay([
        thread({
          has_unread_reaction: true,
          unread_reaction_count: 1,
          last_reaction_emoji: '🎉',
        }),
      ])
    ).toEqual({ type: 'emoji', value: '🎉' })
  })

  it('возвращает число, когда один тред с 2 реакциями', () => {
    expect(
      getAggregateBadgeDisplay([
        thread({
          has_unread_reaction: true,
          unread_reaction_count: 2,
          last_reaction_emoji: '👍',
        }),
      ])
    ).toEqual({ type: 'number', value: 2 })
  })

  it('возвращает число когда несколько тредов с реакциями', () => {
    expect(
      getAggregateBadgeDisplay([
        thread({
          has_unread_reaction: true,
          unread_reaction_count: 1,
          last_reaction_emoji: '👍',
        }),
        thread({
          has_unread_reaction: true,
          unread_reaction_count: 1,
          last_reaction_emoji: '❤️',
        }),
      ])
    ).toEqual({ type: 'number', value: 2 })
  })

  it('возвращает точку когда есть только manually_unread', () => {
    expect(
      getAggregateBadgeDisplay([
        thread({ manually_unread: true }),
        thread({ manually_unread: true }),
      ])
    ).toEqual({ type: 'dot' })
  })

  it('число имеет приоритет над точкой', () => {
    expect(
      getAggregateBadgeDisplay([
        thread({ unread_count: 1 }),
        thread({ manually_unread: true }),
      ])
    ).toEqual({ type: 'number', value: 1 })
  })
})

describe('calcThreadUnread', () => {
  it('возвращает 0 для треда без активности', () => {
    expect(calcThreadUnread(thread({}))).toBe(0)
  })

  it('возвращает unread_count', () => {
    expect(calcThreadUnread(thread({ unread_count: 5 }))).toBe(5)
  })

  it('добавляет реакции и события', () => {
    expect(
      calcThreadUnread(
        thread({
          unread_count: 2,
          has_unread_reaction: true,
          unread_reaction_count: 2,
          unread_event_count: 1,
        })
      )
    ).toBe(5)
  })

  it('возвращает -1 для manually_unread без активности', () => {
    expect(calcThreadUnread(thread({ manually_unread: true }))).toBe(-1)
  })
})

describe('calcTotalUnread', () => {
  it('возвращает 0 для пустого массива', () => {
    expect(calcTotalUnread([])).toBe(0)
  })

  it('суммирует все непрочитанные', () => {
    expect(
      calcTotalUnread([
        thread({ unread_count: 3 }),
        thread({
          unread_count: 2,
          has_unread_reaction: true,
          unread_reaction_count: 1,
        }),
      ])
    ).toBe(6)
  })

  it('считает manually_unread как 1', () => {
    expect(
      calcTotalUnread([
        thread({ unread_count: 2 }),
        thread({ manually_unread: true }),
      ])
    ).toBe(3)
  })
})

describe('formatBadgeCount', () => {
  it('возвращает число для значений до 99', () => {
    expect(formatBadgeCount(1)).toBe('1')
    expect(formatBadgeCount(50)).toBe('50')
    expect(formatBadgeCount(99)).toBe('99')
  })

  it('возвращает "99+" для значений больше 99', () => {
    expect(formatBadgeCount(100)).toBe('99+')
    expect(formatBadgeCount(999)).toBe('99+')
  })
})
