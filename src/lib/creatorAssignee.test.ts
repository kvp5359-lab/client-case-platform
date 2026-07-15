import { describe, it, expect } from 'vitest'
import { splitCreatorSentinel, withCreatorSentinel } from './creatorAssignee'
import { CREATOR_ASSIGNEE_ID } from '@/types/participants'

describe('withCreatorSentinel', () => {
  it('добавляет пункт «Создатель задачи», когда флаг включён', () => {
    const ids = withCreatorSentinel(['p1', 'p2'], true)
    expect(ids).toEqual(new Set(['p1', 'p2', CREATOR_ASSIGNEE_ID]))
  })

  it('не добавляет пункт, когда флаг выключен', () => {
    expect(withCreatorSentinel(['p1'], false)).toEqual(new Set(['p1']))
  })

  it('шаблон только с «создателем» — без реальных исполнителей', () => {
    expect(withCreatorSentinel([], true)).toEqual(new Set([CREATOR_ASSIGNEE_ID]))
  })
})

describe('splitCreatorSentinel', () => {
  it('вынимает сентинел во флаг, остальных оставляет списком', () => {
    expect(splitCreatorSentinel(new Set(['p1', CREATOR_ASSIGNEE_ID, 'p2']))).toEqual({
      assignToCreator: true,
      assigneeIds: ['p1', 'p2'],
    })
  })

  it('без сентинела — флаг выключен', () => {
    expect(splitCreatorSentinel(['p1'])).toEqual({
      assignToCreator: false,
      assigneeIds: ['p1'],
    })
  })

  it('сентинел никогда не попадает в список id (там FK на участника)', () => {
    const { assigneeIds } = splitCreatorSentinel([CREATOR_ASSIGNEE_ID])
    expect(assigneeIds).toEqual([])
  })

  it('пустой набор', () => {
    expect(splitCreatorSentinel([])).toEqual({ assignToCreator: false, assigneeIds: [] })
  })

  it('круговой переход сохраняет исходное состояние', () => {
    const stored = { assigneeIds: ['p1', 'p2'], assignToCreator: true }
    const round = splitCreatorSentinel(
      withCreatorSentinel(stored.assigneeIds, stored.assignToCreator),
    )
    expect(round).toEqual({ assignToCreator: true, assigneeIds: ['p1', 'p2'] })
  })
})
