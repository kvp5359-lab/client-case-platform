import { describe, expect, it } from 'vitest'
import {
  isRowBlank,
  isRowValid,
  rowAmount,
  type TransactionEntryRow,
} from './transactionEntryRow'

const row = (patch: Partial<TransactionEntryRow> = {}): TransactionEntryRow => ({
  key: 0,
  date: '2026-07-24',
  categoryId: null,
  taxRateId: null,
  amountText: '',
  participantId: null,
  comment: '',
  ...patch,
})

describe('rowAmount', () => {
  it('парсит точку и запятую как десятичный разделитель', () => {
    expect(rowAmount(row({ amountText: '12.5' }))).toBe(12.5)
    expect(rowAmount(row({ amountText: '12,5' }))).toBe(12.5)
  })

  it('мусор и пустая строка → 0', () => {
    expect(rowAmount(row({ amountText: '' }))).toBe(0)
    expect(rowAmount(row({ amountText: 'abc' }))).toBe(0)
    expect(rowAmount(row({ amountText: 'Infinity' }))).toBe(0)
  })
})

describe('isRowBlank', () => {
  it('нетронутая строка — blank (дата и налог предзаполняются, не считаются)', () => {
    expect(isRowBlank(row())).toBe(true)
    expect(isRowBlank(row({ date: '2020-01-01', taxRateId: 'tax-1' }))).toBe(true)
  })

  it('сумма, статья, контрагент или комментарий делают строку не-blank', () => {
    expect(isRowBlank(row({ amountText: '1' }))).toBe(false)
    expect(isRowBlank(row({ categoryId: 'cat-1' }))).toBe(false)
    expect(isRowBlank(row({ participantId: 'p-1' }))).toBe(false)
    expect(isRowBlank(row({ comment: 'аванс' }))).toBe(false)
  })

  it('пробельные сумма/комментарий не считаются данными', () => {
    expect(isRowBlank(row({ amountText: '  ', comment: '  ' }))).toBe(true)
  })
})

describe('isRowValid', () => {
  it('валидна только с положительной суммой и датой', () => {
    expect(isRowValid(row({ amountText: '100' }))).toBe(true)
    expect(isRowValid(row({ amountText: '0' }))).toBe(false)
    expect(isRowValid(row({ amountText: '-5' }))).toBe(false)
    expect(isRowValid(row({ amountText: '100', date: '' }))).toBe(false)
  })
})
