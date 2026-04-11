"use client"

/**
 * KeyValueTableField — компонент для отображения и редактирования таблицы ключ-значение
 * Используется для полей типа 'key-value-table'
 */

import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { cn } from '@/lib/utils'
import { safeCssColor } from '@/utils/isValidCssColor'
import { parseDateString, formatDateToString } from '@/utils/format/dateFormat'

interface TableColumn {
  name: string
  type: 'text' | 'number' | 'email' | 'phone' | 'date'
  width?: number
}

interface KeyValueTableFieldProps {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  columns?: TableColumn[]
  headerColor?: string
  disabled?: boolean
}

type TableRow = string[] // Массив значений для каждой колонки

// Маппинг типов колонок на HTML input type — вынесен из компонента
const INPUT_TYPE_MAP: Record<string, string> = {
  number: 'number',
  email: 'email',
  phone: 'tel',
}

const DEFAULT_COLUMNS: TableColumn[] = [
  { name: 'Ключ', type: 'text' },
  { name: 'Значение', type: 'text' },
]

export function KeyValueTableField({
  value,
  onChange,
  onBlur,
  columns = DEFAULT_COLUMNS,
  headerColor,
  disabled = false,
}: KeyValueTableFieldProps) {
  const hasFocusedRef = useRef(false)
  // Флаг внутреннего изменения — предотвращает цикл onChange → value → useEffect → setRows
  const internalChangeRef = useRef<string | null>(null)

  // Parse value from JSON into rows
  const parseRows = (val: string): TableRow[] => {
    if (!val) return []
    try {
      const parsed = JSON.parse(val)
      if (Array.isArray(parsed)) {
        return parsed.map((row: unknown) => {
          if (typeof row === 'object' && row !== null && 'key' in row && 'value' in row) {
            const oldRow = row as { key?: string; value?: string }
            return [oldRow.key || '', oldRow.value || '']
          } else if (Array.isArray(row)) {
            const newRow = [...row] as string[]
            while (newRow.length < columns.length) {
              newRow.push('')
            }
            return newRow.slice(0, columns.length)
          }
          return new Array(columns.length).fill('')
        })
      }
      return []
    } catch {
      return []
    }
  }

  const [rows, setRows] = useState<TableRow[]>(() => parseRows(value))

  // Синхронизация только при ВНЕШНЕМ изменении value/columns
  // Пропускаем, если value совпадает с последним внутренним onChange
  useEffect(() => {
    if (internalChangeRef.current === value) {
      internalChangeRef.current = null
      return
    }
     
    setRows(parseRows(value))
    // parseRows использует columns через замыкание
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, columns])

  // Update parent when rows change
  const handleRowsChange = (newRows: TableRow[]) => {
    setRows(newRows)
    const serialized = JSON.stringify(newRows)
    internalChangeRef.current = serialized
    onChange(serialized)
  }

  const handleAddRow = () => {
    const newRow = new Array(columns.length).fill('')
    handleRowsChange([...rows, newRow])
  }

  const handleDeleteRow = (index: number) => {
    const newRows = rows.filter((_, i) => i !== index)
    handleRowsChange(newRows)
  }

  const handleCellChange = (rowIndex: number, columnIndex: number, newValue: string) => {
    const newRows = [...rows]
    if (!newRows[rowIndex]) {
      newRows[rowIndex] = new Array(columns.length).fill('')
    }
    newRows[rowIndex] = [...newRows[rowIndex]]
    newRows[rowIndex][columnIndex] = newValue
    handleRowsChange(newRows)
  }

  const handleCellFocus = () => {
    if (!hasFocusedRef.current) {
      hasFocusedRef.current = true
    }
  }

  const handleCellBlur = () => {
    if (hasFocusedRef.current) {
      hasFocusedRef.current = false
      onBlur?.()
    }
  }

  const renderCellInput = (
    rowIndex: number,
    columnIndex: number,
    columnType: string,
    cellValue: string,
  ) => {
    if (columnType === 'date') {
      return (
        <DatePicker
          date={parseDateString(cellValue)}
          onDateChange={(date) => {
            handleCellChange(rowIndex, columnIndex, formatDateToString(date))
            handleCellBlur()
          }}
          placeholder="ДД/ММ/ГГГГ"
          disabled={disabled}
        />
      )
    }

    const inputType = INPUT_TYPE_MAP[columnType] || 'text'
    return (
      <input
        type={inputType}
        value={cellValue}
        onChange={(e) => handleCellChange(rowIndex, columnIndex, e.target.value)}
        onFocus={handleCellFocus}
        onBlur={handleCellBlur}
        disabled={disabled}
        className={cn(
          'w-full border-0 bg-transparent p-0 focus:outline-none focus:ring-0 text-sm disabled:cursor-not-allowed disabled:opacity-50',
          columnType === 'number' &&
            'text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
        )}
      />
    )
  }

  // Средние колонки скрываем на мобильных (если колонок > 2)
  const isMiddleColumn = (index: number) =>
    columns.length > 2 && index > 0 && index < columns.length - 1

  return (
    <div className="w-full group/table">
      <div
        className={cn('overflow-hidden rounded-lg', !headerColor && 'border border-border')}
        style={headerColor ? { border: `1px solid ${safeCssColor(headerColor)}` } : undefined}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-full">
            <colgroup>
              {columns.map((column, index) => (
                <col
                  key={index}
                  className={cn(isMiddleColumn(index) && 'hidden md:table-column')}
                  style={{ width: column.width ? `${column.width}%` : 'auto' }}
                />
              ))}
            </colgroup>
            <thead>
              <tr
                className={cn(!headerColor && 'bg-muted border-b')}
                style={
                  headerColor
                    ? {
                        backgroundColor: safeCssColor(headerColor),
                        borderBottom: `1px solid ${safeCssColor(headerColor)}`,
                      }
                    : undefined
                }
              >
                {columns.map((column, index) => (
                  <th
                    key={index}
                    className={cn(
                      'py-1.5 px-3 text-left text-xs font-semibold text-muted-foreground',
                      isMiddleColumn(index) && 'hidden md:table-cell',
                      index === columns.length - 1 && columns.length > 2 && 'w-[80px] md:w-auto',
                    )}
                  >
                    {column.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="py-4 text-center text-sm text-muted-foreground"
                  >
                    Нет строк. Нажмите «+» чтобы добавить.
                  </td>
                </tr>
              ) : (
                rows.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className={cn(
                      'hover:bg-muted/20 transition-colors group',
                      !headerColor && 'border-b',
                    )}
                    style={
                      headerColor
                        ? {
                            borderBottom: `1px solid ${safeCssColor(headerColor)}40`,
                          }
                        : undefined
                    }
                  >
                    {columns.map((column, columnIndex) => (
                      <td
                        key={columnIndex}
                        className={cn(
                          'py-0.5 px-3 relative',
                          isMiddleColumn(columnIndex) && 'hidden md:table-cell',
                          columnIndex === columns.length - 1 &&
                            columns.length > 2 &&
                            'w-[80px] md:w-auto',
                        )}
                      >
                        {columnIndex === 0 ? (
                          <div className="flex items-center gap-1">
                            <div className="flex-1 min-w-0">
                              {renderCellInput(
                                rowIndex,
                                columnIndex,
                                column.type,
                                row[columnIndex] || '',
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteRow(rowIndex)}
                              disabled={disabled}
                              className="h-5 w-5 p-0 shrink-0 text-destructive hover:text-destructive hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Удалить строку"
                              aria-label="Удалить строку"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          renderCellInput(
                            rowIndex,
                            columnIndex,
                            column.type,
                            row[columnIndex] || '',
                          )
                        )}
                        {columnIndex < columns.length - 1 && (
                          <div className="absolute right-0 top-0 bottom-0 flex items-stretch py-1.5">
                            <div
                              className={cn('w-px', !headerColor && 'bg-gray-300')}
                              style={
                                headerColor
                                  ? { backgroundColor: `${safeCssColor(headerColor)}60` }
                                  : undefined
                              }
                            />
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="h-7 mt-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleAddRow}
          disabled={disabled}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground opacity-0 group-hover/table:opacity-100 transition-opacity"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Добавить строку
        </Button>
      </div>
    </div>
  )
}
