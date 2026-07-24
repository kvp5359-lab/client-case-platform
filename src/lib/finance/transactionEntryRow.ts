/**
 * Чистая логика строк многострочной формы операций
 * (ProjectTransactionFormDialog): парсинг суммы и классификация строки.
 */

/** Одна запись формы (черновик до сохранения). */
export type TransactionEntryRow = {
  key: number
  date: string
  categoryId: string | null
  taxRateId: string | null
  amountText: string
  participantId: string | null
  comment: string
}

/** Сумма строки: запятая как десятичный разделитель, мусор → 0. */
export const rowAmount = (row: TransactionEntryRow): number => {
  const n = Number(row.amountText.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/**
 * Совсем нетронутая строка — молча игнорируется при сохранении.
 * Дата и налог не считаются «данными»: они предзаполняются автоматически.
 */
export const isRowBlank = (row: TransactionEntryRow): boolean =>
  row.amountText.trim() === '' &&
  !row.categoryId &&
  !row.participantId &&
  row.comment.trim() === ''

export const isRowValid = (row: TransactionEntryRow): boolean =>
  rowAmount(row) > 0 && !!row.date
