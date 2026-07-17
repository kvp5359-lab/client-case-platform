import { describe, it, expect } from 'vitest'
import {
  resolvePeriodRange,
  applyPeriodToConfig,
  extractPeriodFromConfig,
  resolveDynamicPeriods,
  stripPeriodConditions,
  buildReportTree,
  leafRows,
  normalizeReportConfig,
  isFlatRecordsConfig,
  buildReportCsv,
  csvColumns,
  formatReportValue,
} from './runtime'
import { getDatasetDef } from './registry'
import type { ReportConfig } from '@/types/reports'

const NOW = new Date(2026, 6, 4) // 4 июля 2026 (месяцы с 0)

describe('resolvePeriodRange', () => {
  it('all → null (без ограничения)', () => {
    expect(resolvePeriodRange({ preset: 'all' }, NOW)).toBeNull()
  })

  it('today — один день', () => {
    expect(resolvePeriodRange({ preset: 'today' }, NOW)).toEqual({
      from: '2026-07-04',
      to: '2026-07-04',
    })
  })

  it('last_7 — 7 дней включительно', () => {
    expect(resolvePeriodRange({ preset: 'last_7' }, NOW)).toEqual({
      from: '2026-06-28',
      to: '2026-07-04',
    })
  })

  it('this_month — с 1 числа', () => {
    expect(resolvePeriodRange({ preset: 'this_month' }, NOW)).toEqual({
      from: '2026-07-01',
      to: '2026-07-04',
    })
  })

  it('last_month — весь прошлый месяц', () => {
    expect(resolvePeriodRange({ preset: 'last_month' }, NOW)).toEqual({
      from: '2026-06-01',
      to: '2026-06-30',
    })
  })

  it('custom с обеими датами', () => {
    expect(
      resolvePeriodRange({ preset: 'custom', from: '2026-01-01', to: '2026-02-01' }, NOW),
    ).toEqual({ from: '2026-01-01', to: '2026-02-01' })
  })

  it('custom без дат → null', () => {
    expect(resolvePeriodRange({ preset: 'custom' }, NOW)).toBeNull()
  })

  // NOW = суббота 04.07.2026; недели считаем с понедельника.
  it('вчера / эта неделя / прошлая неделя', () => {
    expect(resolvePeriodRange({ preset: 'yesterday' }, NOW)).toEqual({
      from: '2026-07-03', to: '2026-07-03',
    })
    expect(resolvePeriodRange({ preset: 'this_week' }, NOW)).toEqual({
      from: '2026-06-29', to: '2026-07-04',
    })
    expect(resolvePeriodRange({ preset: 'last_week' }, NOW)).toEqual({
      from: '2026-06-22', to: '2026-06-28',
    })
  })

  it('кварталы и прошлый год', () => {
    expect(resolvePeriodRange({ preset: 'this_quarter' }, NOW)).toEqual({
      from: '2026-07-01', to: '2026-07-04',
    })
    expect(resolvePeriodRange({ preset: 'last_quarter' }, NOW)).toEqual({
      from: '2026-04-01', to: '2026-06-30',
    })
    expect(resolvePeriodRange({ preset: 'last_year' }, NOW)).toEqual({
      from: '2025-01-01', to: '2025-12-31',
    })
  })

  it('90 дней включительно', () => {
    expect(resolvePeriodRange({ preset: 'last_90' }, NOW)).toEqual({
      from: '2026-04-06', to: '2026-07-04',
    })
  })
})

describe('resolveDynamicPeriods', () => {
  const base: ReportConfig = {
    dataset: 'projects',
    groupBy: [{ field: 'template' }],
    columns: [{ key: 'template' }],
  }

  it('dyn_period разворачивается в between с датами пресета', () => {
    const out = resolveDynamicPeriods(
      {
        ...base,
        filter: {
          logic: 'and',
          rules: [
            { type: 'condition', field: 'template', operator: 'in', value: ['x'] },
            { type: 'condition', field: 'created', operator: 'dyn_period', value: 'this_month' },
          ],
        },
      },
      NOW,
    )
    expect(out.filter?.rules[1]).toEqual({
      type: 'condition',
      field: 'created',
      operator: 'between',
      value: ['2026-07-01', '2026-07-04'],
    })
    // Прочие условия не тронуты.
    expect(out.filter?.rules[0]).toMatchObject({ operator: 'in' })
  })

  it('работает во вложенной группе, неизвестный пресет снимает условие', () => {
    const out = resolveDynamicPeriods(
      {
        ...base,
        filter: {
          logic: 'and',
          rules: [
            {
              type: 'group',
              group: {
                logic: 'or',
                rules: [
                  { type: 'condition', field: 'created', operator: 'dyn_period', value: 'yesterday' },
                  { type: 'condition', field: 'created', operator: 'dyn_period', value: 'мусор' },
                ],
              },
            },
          ],
        },
      },
      NOW,
    )
    const inner = out.filter?.rules[0]
    if (inner?.type !== 'group') throw new Error('ожидалась группа')
    expect(inner.group.rules).toHaveLength(1)
    expect(inner.group.rules[0]).toMatchObject({
      operator: 'between',
      value: ['2026-07-03', '2026-07-03'],
    })
  })

  it('без фильтра конфиг не меняется', () => {
    expect(resolveDynamicPeriods(base, NOW)).toBe(base)
  })
})

describe('applyPeriodToConfig', () => {
  const base: ReportConfig = {
    dataset: 'transactions',
    groupBy: [{ field: 'category' }],
    columns: [{ key: 'category' }, { key: 'amount', agg: 'sum' }],
  }

  it('вклеивает between по periodField датасета', () => {
    const out = applyPeriodToConfig(base, { preset: 'this_month' }, NOW)
    expect(out.filter).toEqual({
      logic: 'and',
      rules: [
        {
          type: 'condition',
          field: 'date',
          operator: 'between',
          value: ['2026-07-01', '2026-07-04'],
        },
      ],
    })
    // Исходный конфиг не мутирован.
    expect(base.filter).toBeUndefined()
  })

  it('сохранённый фильтр оборачивается в группу + AND период', () => {
    const withFilter: ReportConfig = {
      ...base,
      filter: {
        logic: 'or',
        rules: [{ type: 'condition', field: 'type', operator: 'equals', value: 'income' }],
      },
    }
    const out = applyPeriodToConfig(withFilter, { preset: 'today' }, NOW)
    expect(out.filter?.logic).toBe('and')
    expect(out.filter?.rules).toHaveLength(2)
    expect(out.filter?.rules[0]).toMatchObject({ type: 'group' })
  })

  it('датасет без periodField (client_balance) — период игнорируется', () => {
    const cfg: ReportConfig = { ...base, dataset: 'client_balance' }
    const out = applyPeriodToConfig(cfg, { preset: 'this_month' }, NOW)
    expect(out.filter).toBeUndefined()
  })

  it('preset=all — конфиг без изменений', () => {
    expect(applyPeriodToConfig(base, { preset: 'all' }, NOW)).toBe(base)
  })
})

describe('extractPeriodFromConfig', () => {
  const base: ReportConfig = {
    dataset: 'projects', // periodField = created
    groupBy: [{ field: 'template' }],
    columns: [{ key: 'template' }],
  }

  it('between по periodField на верхнем уровне → пресет custom с датами', () => {
    const out = extractPeriodFromConfig({
      ...base,
      filter: {
        logic: 'and',
        rules: [
          { type: 'condition', field: 'template', operator: 'in', value: ['x'] },
          { type: 'condition', field: 'created', operator: 'between', value: ['2026-07-01', '2026-07-16'] },
        ],
      },
    })
    expect(out).toEqual({ preset: 'custom', from: '2026-07-01', to: '2026-07-16' })
  })

  it('нет условия по дате / OR-группа / другой оператор → null', () => {
    expect(extractPeriodFromConfig(base)).toBeNull()
    expect(
      extractPeriodFromConfig({
        ...base,
        filter: {
          logic: 'or',
          rules: [{ type: 'condition', field: 'created', operator: 'between', value: ['a', 'b'] }],
        },
      }),
    ).toBeNull()
    expect(
      extractPeriodFromConfig({
        ...base,
        filter: {
          logic: 'and',
          rules: [{ type: 'condition', field: 'created', operator: 'after_eq', value: '2026-07-01' }],
        },
      }),
    ).toBeNull()
  })

  it('dyn_period по periodField → сам пресет (селект покажет «Этот месяц»)', () => {
    const out = extractPeriodFromConfig({
      ...base,
      filter: {
        logic: 'and',
        rules: [{ type: 'condition', field: 'created', operator: 'dyn_period', value: 'this_month' }],
      },
    })
    expect(out).toEqual({ preset: 'this_month' })
  })

  it('dyn_period со значением all/custom не считается периодом (нет дат)', () => {
    const withValue = (value: string): ReportConfig => ({
      ...base,
      filter: {
        logic: 'and',
        rules: [{ type: 'condition', field: 'created', operator: 'dyn_period', value }],
      },
    })
    expect(extractPeriodFromConfig(withValue('all'))).toBeNull()
    expect(extractPeriodFromConfig(withValue('custom'))).toBeNull()
  })

  it('датасет без periodField (client_balance) → null', () => {
    expect(
      extractPeriodFromConfig({
        ...base,
        dataset: 'client_balance',
        filter: {
          logic: 'and',
          rules: [{ type: 'condition', field: 'created', operator: 'between', value: ['a', 'b'] }],
        },
      }),
    ).toBeNull()
  })
})

describe('stripPeriodConditions — выбор периода на странице заменяет фильтр', () => {
  const base: ReportConfig = {
    dataset: 'projects', // periodField = created
    groupBy: [{ field: 'template' }],
    columns: [{ key: 'template' }],
  }

  it('вырезает dyn_period и between по periodField, остальное не трогает', () => {
    const out = stripPeriodConditions({
      ...base,
      filter: {
        logic: 'and',
        rules: [
          { type: 'condition', field: 'template', operator: 'in', value: ['x'] },
          { type: 'condition', field: 'created', operator: 'dyn_period', value: 'this_month' },
          { type: 'condition', field: 'created', operator: 'between', value: ['2026-01-01', '2026-02-01'] },
          // Дедлайн — не periodField, условие остаётся.
          { type: 'condition', field: 'deadline', operator: 'dyn_period', value: 'this_month' },
        ],
      },
    })
    expect(out.filter?.rules).toHaveLength(2)
    expect(out.filter?.rules[0]).toMatchObject({ field: 'template' })
    expect(out.filter?.rules[1]).toMatchObject({ field: 'deadline' })
  })

  it('страница: период фильтра «этот месяц» + выбор «прошлый месяц» → в итоге только прошлый', () => {
    const config: ReportConfig = {
      ...base,
      filter: {
        logic: 'and',
        rules: [{ type: 'condition', field: 'created', operator: 'dyn_period', value: 'this_month' }],
      },
    }
    // Тот же конвейер, что собирает runtimeConfig на странице отчёта.
    const runtime = applyPeriodToConfig(
      resolveDynamicPeriods(stripPeriodConditions(normalizeReportConfig(config)), NOW),
      { preset: 'last_month' },
      NOW,
    )
    expect(runtime.filter?.rules).toEqual([
      {
        type: 'condition',
        field: 'created',
        operator: 'between',
        value: ['2026-06-01', '2026-06-30'],
      },
    ])
  })

  it('нечего вырезать → конфиг не меняется', () => {
    expect(stripPeriodConditions(base)).toBe(base)
  })
})

describe('normalizeReportConfig', () => {
  it('без колонок подставляет набор датасета по умолчанию', () => {
    const out = normalizeReportConfig({
      dataset: 'projects',
      groupBy: [{ field: 'template' }],
      columns: [],
    })
    expect(out.columns.length).toBeGreaterThan(0)
    expect(out.columns.every((c) => typeof c.key === 'string')).toBe(true)
    expect(out.showRecords).toBe(false)
  })

  it('заданные колонки не трогает', () => {
    const columns = [{ key: 'template' }, { key: 'project', agg: 'count' as const }]
    const out = normalizeReportConfig({
      dataset: 'projects',
      groupBy: [{ field: 'template' }],
      columns,
      showRecords: true,
    })
    expect(out.columns).toEqual(columns)
    expect(out.showRecords).toBe(true)
  })

  it('больше 3 уровней группировки отсекается', () => {
    const out = normalizeReportConfig({
      dataset: 'threads',
      groupBy: [
        { field: 'thread_type' },
        { field: 'status' },
        { field: 'project' },
        { field: 'created' },
      ],
      columns: [{ key: 'thread' }],
    })
    expect(out.groupBy).toHaveLength(3)
  })

  it('isFlatRecordsConfig — только без групп и с записями', () => {
    const flat: ReportConfig = {
      dataset: 'projects', groupBy: [], columns: [{ key: 'project' }], showRecords: true,
    }
    const totalsOnly: ReportConfig = {
      dataset: 'projects', groupBy: [], columns: [{ key: 'project', agg: 'count' }],
    }
    expect(isFlatRecordsConfig(flat)).toBe(true)
    expect(isFlatRecordsConfig(totalsOnly)).toBe(false)
  })
})

describe('buildReportTree', () => {
  const config: ReportConfig = {
    dataset: 'transactions',
    groupBy: [{ field: 'type' }, { field: 'date', granularity: 'month' }],
    columns: [
      { key: 'type' },
      { key: 'date' },
      { key: 'amount', agg: 'sum' },
      { key: 'project', agg: 'count' },
    ],
  }

  // Как отдаёт сервер (GROUPING SETS): строки уровня 1 и уровня 2 вперемешку.
  const rows = [
    { level: 2, g0: 'Доход', g1: '2026-05', c2: 100.5, c3: 2 },
    { level: 1, g0: 'Доход', g1: null, c2: 150.5, c3: 3 },
    { level: 2, g0: 'Доход', g1: '2026-06', c2: 50, c3: 1 },
    { level: 1, g0: 'Расход', g1: null, c2: 30, c3: 1 },
    { level: 2, g0: 'Расход', g1: '2026-05', c2: 30, c3: 1 },
  ]

  it('строит уровни и вкладывает детей в родителя', () => {
    const tree = buildReportTree(rows, config)
    expect(tree).toHaveLength(2)
    expect(tree.map((n) => n.label)).toEqual(['Доход', 'Расход'])
    expect(tree[0].children.map((n) => n.label)).toEqual(['2026-05', '2026-06'])
    expect(tree[1].children).toHaveLength(1)
  })

  it('агрегаты узла берутся с сервера, а не суммируются на клиенте', () => {
    const tree = buildReportTree(rows, config)
    expect(tree[0].cells).toEqual({ c2: 150.5, c3: 3 })
    expect(tree[0].children[0].cells).toEqual({ c2: 100.5, c3: 2 })
  })

  it('path узла — путь значений групп (по нему догружаются записи)', () => {
    const tree = buildReportTree(rows, config)
    expect(tree[0].path).toEqual(['Доход'])
    expect(tree[0].children[1].path).toEqual(['Доход', '2026-06'])
  })

  it('сортировка по колонке группировки — по названию, в обратную сторону', () => {
    // c0 — колонка «Тип», по ней группируем: агрегата нет → сортируем по названию.
    const tree = buildReportTree(rows, { ...config, sort: { by: 'c0', dir: 'desc' } })
    expect(tree.map((n) => n.label)).toEqual(['Расход', 'Доход'])
  })

  it('сортировка по агрегату: убывание ставит большую группу первой', () => {
    const tree = buildReportTree(rows, { ...config, sort: { by: 'c2', dir: 'desc' } })
    expect(tree.map((n) => n.label)).toEqual(['Доход', 'Расход'])
    // Внутри «Доход»: 100.5 > 50
    expect(tree[0].children.map((n) => n.label)).toEqual(['2026-05', '2026-06'])
  })

  it('сортировка по агрегату: возрастание переворачивает порядок', () => {
    const tree = buildReportTree(rows, { ...config, sort: { by: 'c2', dir: 'asc' } })
    expect(tree.map((n) => n.label)).toEqual(['Расход', 'Доход'])
    expect(tree[0].children.map((n) => n.label)).toEqual(['2026-05'])
    expect(tree[1].children.map((n) => n.label)).toEqual(['2026-06', '2026-05'])
  })

  it('без группировок дерева нет', () => {
    expect(buildReportTree(rows, { ...config, groupBy: [] })).toEqual([])
  })

  it('уровень выводится из g-значений, если сервер не прислал level', () => {
    const tree = buildReportTree(
      [
        { g0: 'Доход', g1: null, c2: 10 },
        { g0: 'Доход', g1: '2026-05', c2: 10 },
      ],
      config,
    )
    expect(tree).toHaveLength(1)
    expect(tree[0].children).toHaveLength(1)
  })

  it('группа со значением «пусто» не схлопывается с подытогом уровня', () => {
    // g1=null на уровне 2 — это реальное пустое значение (например, нет срока).
    const tree = buildReportTree(
      [
        { level: 1, g0: 'Задача', g1: null, c2: 5 },
        { level: 2, g0: 'Задача', g1: null, c2: 5 },
      ],
      config,
    )
    expect(tree).toHaveLength(1)
    expect(tree[0].cells.c2).toBe(5)
    expect(tree[0].children).toHaveLength(1)
    expect(tree[0].children[0].label).toBe('—')
  })
})

describe('leafRows', () => {
  it('оставляет только строки самого глубокого уровня', () => {
    const config: ReportConfig = {
      dataset: 'transactions',
      groupBy: [{ field: 'type' }, { field: 'date' }],
      columns: [{ key: 'type' }, { key: 'date' }, { key: 'project', agg: 'count' }],
    }
    const out = leafRows(
      [
        { level: 1, g0: 'Доход', g1: null, c2: 3 },
        { level: 2, g0: 'Доход', g1: '2026-05', c2: 2 },
        { level: 2, g0: 'Доход', g1: '2026-06', c2: 1 },
      ],
      config,
    )
    expect(out).toHaveLength(2)
    expect(out.every((r) => r.level === 2)).toBe(true)
  })

  it('без группировок возвращает строки как есть', () => {
    const config: ReportConfig = {
      dataset: 'projects', groupBy: [], columns: [{ key: 'project' }], showRecords: true,
    }
    const rows = [{ c0: 'А' }, { c0: 'Б' }]
    expect(leafRows(rows, config)).toEqual(rows)
  })
})

describe('csvColumns — выгрузка сводки', () => {
  // Конфиг «Количество заказов»: группировка по шаблону, счётчик на «Проект».
  const config: ReportConfig = {
    dataset: 'projects',
    groupBy: [{ field: 'template' }],
    showRecords: true,
    columns: [
      { key: 'template' },
      { key: 'project', agg: 'count' },
      { key: 'status' },
      { key: 'created' },
    ],
  }
  const dataset = getDatasetDef('projects')

  it('колонка группировки читается из gN, колонки без агрегата пропускаются', () => {
    expect(csvColumns(config, dataset)).toEqual([
      { key: 'g0', label: 'Шаблон' },
      { key: 'c1', label: 'Проект' },
    ])
  })

  it('связка с leafRows и buildReportCsv: название группы попадает в CSV', () => {
    // Как отдаёт сервер: подытог-строки уровней с g0 и агрегатом c1.
    const serverRows = [
      { level: 1, g0: 'Бизнес-план', c1: 7 },
      { level: 1, g0: 'ВНЖ', c1: 1 },
    ]
    const csv = buildReportCsv(csvColumns(config, dataset), leafRows(serverRows, config))
    const lines = csv.split('\r\n')
    expect(lines[1]).toBe('Бизнес-план;7')
    expect(lines[2]).toBe('ВНЖ;1')
  })

  it('без группировок — все колонки по своим алиасам', () => {
    const flat: ReportConfig = { ...config, groupBy: [] }
    expect(csvColumns(flat, dataset).map((c) => c.key)).toEqual(['c0', 'c1', 'c2', 'c3'])
  })
})

describe('buildReportCsv', () => {
  it('BOM + «;» + экранирование', () => {
    const csv = buildReportCsv(
      [
        { key: 'name', label: 'Имя' },
        { key: 'sum', label: 'Сумма; €' },
      ],
      [
        { name: 'Иван "Грозный"', sum: 100 },
        { name: 'Пётр', sum: null },
      ],
    )
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('﻿Имя;"Сумма; €"')
    expect(lines[1]).toBe('"Иван ""Грозный""";100')
    expect(lines[2]).toBe('Пётр;')
  })
})

describe('formatReportValue', () => {
  it('money — 2 знака и €', () => {
    expect(formatReportValue(1291.79, 'money')).toContain('1')
    expect(formatReportValue(1291.79, 'money')).toContain('€')
  })
  it('null → тире', () => {
    expect(formatReportValue(null, 'money')).toBe('—')
  })
})
