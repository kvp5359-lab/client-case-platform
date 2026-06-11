import { describe, it, expect } from 'vitest'
import { mergeFilterGroupsOr, EMPTY_FILTER_GROUP, type FilterGroup } from './types'
import { lowerFilterForServer, buildBoardServerFilter, type BoardListFilterInput } from './lowerForServer'

const cond = (field: string, operator: string, value: unknown): FilterGroup['rules'][number] => ({
  type: 'condition', field, operator, value,
})

const group = (rules: FilterGroup['rules'], logic: 'and' | 'or' = 'and'): FilterGroup => ({ logic, rules })

const ids = { currentParticipantId: 'pid-1', currentUserId: 'uid-1' }

describe('mergeFilterGroupsOr', () => {
  it('пустой массив → пустая группа', () => {
    expect(mergeFilterGroupsOr([])).toEqual(EMPTY_FILTER_GROUP)
  })

  it('одна группа → она же без обёртки', () => {
    const g = group([cond('status_id', 'in', ['a'])])
    expect(mergeFilterGroupsOr([g])).toBe(g)
  })

  it('любая пустая группа среди слагаемых → весь union пустой (список без фильтра = всё)', () => {
    const g = group([cond('status_id', 'in', ['a'])])
    expect(mergeFilterGroupsOr([g, EMPTY_FILTER_GROUP])).toEqual(EMPTY_FILTER_GROUP)
  })

  it('несколько непустых → OR из вложенных групп', () => {
    const a = group([cond('status_id', 'in', ['a'])])
    const b = group([cond('type', 'equals', 'task')])
    expect(mergeFilterGroupsOr([a, b])).toEqual({
      logic: 'or',
      rules: [
        { type: 'group', group: a },
        { type: 'group', group: b },
      ],
    })
  })
})

describe('lowerFilterForServer', () => {
  it('__me__ в created_by → user_id', () => {
    const r = lowerFilterForServer(group([cond('created_by', 'equals', '__me__')]), ids)
    expect(r.rules[0]).toEqual(cond('created_by', 'equals', 'uid-1'))
  })

  it('__me__ в assignees (массив) → participant_id', () => {
    const r = lowerFilterForServer(group([cond('assignees', 'in', ['__me__'])]), ids)
    expect(r.rules[0]).toEqual(cond('assignees', 'in', ['pid-1']))
  })

  it('__me__ вперемешку с обычными id — обычные не трогаются', () => {
    const r = lowerFilterForServer(group([cond('assignees', 'in', ['x', '__me__'])]), ids)
    expect(r.rules[0]).toEqual(cond('assignees', 'in', ['x', 'pid-1']))
  })

  it('неразрешимый __me__ (нет id) → noop-условие (сервер → true)', () => {
    const r = lowerFilterForServer(
      group([cond('created_by', 'equals', '__me__')]),
      { currentParticipantId: null, currentUserId: null },
    )
    expect(r.rules[0]).toEqual({ type: 'condition', field: '__noop__', operator: 'is_not_null', value: null })
  })

  it('обычные значения, __creator__ и даты не трогаются', () => {
    const src = group([
      cond('status_id', 'in', ['a', 'b']),
      cond('assignees', 'in', ['__creator__']),
      cond('deadline', 'before_eq', '__today__'),
    ])
    expect(lowerFilterForServer(src, ids)).toEqual(src)
  })

  it('рекурсивно заходит во вложенные группы', () => {
    const src = group([
      { type: 'group', group: group([cond('created_by', 'equals', '__me__')], 'or') },
    ])
    const r = lowerFilterForServer(src, ids)
    expect(r.rules[0]).toEqual({
      type: 'group',
      group: group([cond('created_by', 'equals', 'uid-1')], 'or'),
    })
  })
})

describe('buildBoardServerFilter', () => {
  const lists: BoardListFilterInput[] = [
    { entity_type: 'thread', filters: group([cond('status_id', 'in', ['s1'])]) },
    { entity_type: 'thread', filters: group([cond('assignees', 'in', ['__me__'])]) },
    { entity_type: 'project', filters: group([cond('status_id', 'in', ['ps1'])]) },
    { entity_type: 'inbox', filters: EMPTY_FILTER_GROUP },
  ]

  it('берёт только списки нужного типа и объединяет через OR + разворачивает __me__', () => {
    const r = buildBoardServerFilter(lists, undefined, 'thread', ids)
    expect(r).toEqual({
      logic: 'or',
      rules: [
        { type: 'group', group: group([cond('status_id', 'in', ['s1'])]) },
        { type: 'group', group: group([cond('assignees', 'in', ['pid-1'])]) },
      ],
    })
  })

  it('накладывает board-level срез через AND на каждый список', () => {
    const boardSlice = group([cond('type', 'equals', 'task')])
    const r = buildBoardServerFilter(
      [{ entity_type: 'thread', filters: group([cond('status_id', 'in', ['s1'])]) }],
      { thread: boardSlice },
      'thread',
      ids,
    )
    // один список → AND(boardSlice, listFilter)
    expect(r).toEqual({
      logic: 'and',
      rules: [
        { type: 'group', group: boardSlice },
        { type: 'group', group: group([cond('status_id', 'in', ['s1'])]) },
      ],
    })
  })

  it('список без фильтра → union вырождается в пустую группу (грузим всё, клиент дорежет)', () => {
    const withEmpty: BoardListFilterInput[] = [
      { entity_type: 'thread', filters: group([cond('status_id', 'in', ['s1'])]) },
      { entity_type: 'thread', filters: EMPTY_FILTER_GROUP },
    ]
    expect(buildBoardServerFilter(withEmpty, undefined, 'thread', ids)).toEqual(EMPTY_FILTER_GROUP)
  })

  it('нет списков нужного типа → пустая группа', () => {
    expect(buildBoardServerFilter(lists, undefined, 'project', ids)).toEqual(group([cond('status_id', 'in', ['ps1'])]))
  })
})
