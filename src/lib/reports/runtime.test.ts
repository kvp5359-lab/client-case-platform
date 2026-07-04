import { describe, it, expect } from 'vitest'
import {
  resolvePeriodRange,
  applyPeriodToConfig,
  sectionizeRows,
  additiveMapForConfig,
  buildReportCsv,
  formatReportValue,
} from './runtime'
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
})

describe('applyPeriodToConfig', () => {
  const base: ReportConfig = {
    dataset: 'transactions',
    mode: 'summary',
    groupBy: [{ field: 'category' }],
    measures: ['sum_amount'],
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

describe('sectionizeRows', () => {
  const rows = [
    { g0: 'Доход', g1: '2026-05', a0: 100.5, a1: 2 },
    { g0: 'Доход', g1: '2026-06', a0: 50, a1: 1 },
    { g0: 'Расход', g1: '2026-05', a0: 30, a1: 1 },
  ]

  it('секции по g0 с подытогами additive-показателей', () => {
    const sections = sectionizeRows(rows, ['a0', 'a1'], { a0: true, a1: true })
    expect(sections).toHaveLength(2)
    expect(sections[0].label).toBe('Доход')
    expect(sections[0].rows).toHaveLength(2)
    expect(sections[0].subtotals).toEqual({ a0: 150.5, a1: 3 })
    expect(sections[1].subtotals).toEqual({ a0: 30, a1: 1 })
  })

  it('не-additive показатель → подытог null', () => {
    const sections = sectionizeRows(rows, ['a0'], { a0: false })
    expect(sections[0].subtotals.a0).toBeNull()
  })
})

describe('additiveMapForConfig', () => {
  it('avg — не additive, sum/count — additive', () => {
    const cfg: ReportConfig = {
      dataset: 'transactions',
      mode: 'summary',
      groupBy: [],
      measures: ['sum_amount', 'avg_amount', 'count'],
    }
    expect(additiveMapForConfig(cfg)).toEqual({ a0: true, a1: false, a2: true })
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
