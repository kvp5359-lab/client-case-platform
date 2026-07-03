import { describe, it, expect } from 'vitest'
import { applyFilters } from './filterEngine'
import type { FilterGroup, FilterContext } from './types'

// ── Фикстуры ─────────────────────────────────────────────
type Task = {
  id: string
  status_id: string | null
  created_by: string | null
  deadline: string | null
}

const TASKS: Task[] = [
  { id: 't1', status_id: 'new', created_by: 'u1', deadline: '2026-07-03T10:00:00Z' },
  { id: 't2', status_id: 'done', created_by: 'u2', deadline: '2026-07-10T10:00:00Z' },
  { id: 't3', status_id: null, created_by: 'u1', deadline: null },
]

const FIELD_ACCESSORS = {
  status_id: (i: unknown) => (i as Task).status_id,
  created_by: (i: unknown) => (i as Task).created_by,
  deadline: (i: unknown) => (i as Task).deadline,
}

// junction: назначенные исполнители по id задачи
const ASSIGNEES: Record<string, string[]> = { t1: ['p1', 'p2'], t2: ['p2'], t3: [] }
const JUNCTION_ACCESSORS = {
  assignees: (id: string) => ASSIGNEES[id] ?? [],
}

function ctx(over: Partial<FilterContext> = {}): FilterContext {
  return {
    currentUserId: 'u1',
    currentParticipantId: 'p1',
    now: new Date('2026-07-03T12:00:00Z'),
    ...over,
  }
}

function run(filters: FilterGroup, over: Partial<FilterContext> = {}) {
  return applyFilters(TASKS, filters, ctx(over), FIELD_ACCESSORS, JUNCTION_ACCESSORS).map((t) => t.id)
}

// ── Базовое ──────────────────────────────────────────────
describe('applyFilters — базовое', () => {
  it('пустая группа возвращает все элементы', () => {
    expect(run({ logic: 'and', rules: [] })).toEqual(['t1', 't2', 't3'])
  })

  it('неизвестное поле не режет (пропускается)', () => {
    expect(
      run({ logic: 'and', rules: [{ type: 'condition', field: 'nope', operator: 'equals', value: 'x' }] }),
    ).toEqual(['t1', 't2', 't3'])
  })
})

// ── Операторы обычных полей ──────────────────────────────
describe('applyFilters — операторы', () => {
  it('equals по одному значению', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'status_id', operator: 'equals', value: 'new' }] })).toEqual(['t1'])
  })

  it('equals с массивом работает как in (мультиселект)', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'status_id', operator: 'equals', value: ['new', 'done'] }] })).toEqual(['t1', 't2'])
  })

  it('__no_status__ ловит null-статус', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'status_id', operator: 'in', value: ['__no_status__'] }] })).toEqual(['t3'])
  })

  it('not_in исключает и не пропускает null при __no_status__', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'status_id', operator: 'not_in', value: ['__no_status__'] }] })).toEqual(['t1', 't2'])
  })

  it('is_null / is_not_null', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'status_id', operator: 'is_null', value: null }] })).toEqual(['t3'])
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'status_id', operator: 'is_not_null', value: null }] })).toEqual(['t1', 't2'])
  })
})

// ── AND / OR / вложенность ───────────────────────────────
describe('applyFilters — логика AND/OR и вложенные группы', () => {
  it('AND — все условия', () => {
    expect(
      run({
        logic: 'and',
        rules: [
          { type: 'condition', field: 'status_id', operator: 'equals', value: 'new' },
          { type: 'condition', field: 'created_by', operator: 'equals', value: 'u1' },
        ],
      }),
    ).toEqual(['t1'])
  })

  it('OR — любое условие', () => {
    expect(
      run({
        logic: 'or',
        rules: [
          { type: 'condition', field: 'status_id', operator: 'equals', value: 'new' },
          { type: 'condition', field: 'status_id', operator: 'equals', value: 'done' },
        ],
      }),
    ).toEqual(['t1', 't2'])
  })

  it('вложенная OR внутри AND', () => {
    // created_by=u1 AND (status=new OR status=null)
    expect(
      run({
        logic: 'and',
        rules: [
          { type: 'condition', field: 'created_by', operator: 'equals', value: 'u1' },
          {
            type: 'group',
            group: {
              logic: 'or',
              rules: [
                { type: 'condition', field: 'status_id', operator: 'equals', value: 'new' },
                { type: 'condition', field: 'status_id', operator: 'is_null', value: null },
              ],
            },
          },
        ],
      }),
    ).toEqual(['t1', 't3'])
  })
})

// ── __me__ / __creator__ ─────────────────────────────────
describe('applyFilters — относительные значения', () => {
  it('__me__ в created_by резолвится в currentUserId', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'created_by', operator: 'equals', value: '__me__' }] }, { currentUserId: 'u2' })).toEqual(['t2'])
  })

  it('__me__ в junction assignees резолвится в currentParticipantId', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'assignees', operator: 'equals', value: '__me__' }] }, { currentParticipantId: 'p2' })).toEqual(['t1', 't2'])
  })

  it('__creator__ резолвится в participant постановщика через userToParticipantMap', () => {
    // t1 создан u1 → p1; фильтр assignees=__creator__ ищет задачи, где постановщик среди исполнителей
    expect(
      run(
        { logic: 'and', rules: [{ type: 'condition', field: 'assignees', operator: 'equals', value: '__creator__' }] },
        { userToParticipantMap: { u1: 'p1', u2: 'p2' } },
      ),
    ).toEqual(['t1', 't2']) // t1: постановщик u1→p1 ∈ [p1,p2]; t2: постановщик u2→p2 ∈ [p2]
  })
})

// ── junction-операторы ───────────────────────────────────
describe('applyFilters — junction (assignees)', () => {
  it('equals по participant_id', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'assignees', operator: 'equals', value: 'p1' }] })).toEqual(['t1'])
  })
  it('in по списку', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'assignees', operator: 'in', value: ['p2'] }] })).toEqual(['t1', 't2'])
  })
  it('is_null = нет исполнителей', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'assignees', operator: 'is_null', value: null }] })).toEqual(['t3'])
  })
  it('is_not_null = есть исполнители', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'assignees', operator: 'is_not_null', value: null }] })).toEqual(['t1', 't2'])
  })
})

// ── Даты и пресеты ───────────────────────────────────────
describe('applyFilters — даты и пресеты', () => {
  it('today ловит дедлайн сегодняшнего дня (now=2026-07-03)', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'deadline', operator: 'today', value: null }] })).toEqual(['t1'])
  })

  it('overdue: дедлайн раньше начала сегодняшнего дня', () => {
    // t1 дедлайн сегодня 10:00, now 12:00 — НЕ overdue (сравнение по началу дня)
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'deadline', operator: 'overdue', value: null }] })).toEqual([])
    // сдвинем now на неделю вперёд → t1 и t2 просрочены
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'deadline', operator: 'overdue', value: null }] }, { now: new Date('2026-07-20T00:00:00Z') })).toEqual(['t1', 't2'])
  })

  it('__last_n_days:7__ (after_eq) включает недавние', () => {
    // deadline после (now - 7 дней). now=07-03 → окно с 06-26. t1 (07-03) входит, t2 (07-10) — будущее, тоже > start
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'deadline', operator: 'after_eq', value: '__last_n_days:7__' }] })).toEqual(['t1', 't2'])
  })

  it('between по конкретным датам', () => {
    expect(
      run({ logic: 'and', rules: [{ type: 'condition', field: 'deadline', operator: 'between', value: ['2026-07-01', '2026-07-05'] }] }),
    ).toEqual(['t1'])
  })

  it('null-дедлайн не проходит дата-условия', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'deadline', operator: 'today', value: null }] })).not.toContain('t3')
  })
})
