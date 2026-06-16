"use client"

import { useCallback, useRef, useState } from 'react'
import { Loader2, Rows3, Rows4 } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { ColumnResizeHandle } from './ColumnResizeHandle'
import type { getColumnDef } from './columns'

export const CHECKBOX_COL_WIDTH = 36

/** Оценка высоты строки (px) для виртуализатора. Уточняется measureElement'ом. */
const ROW_ESTIMATE = { comfortable: 37, compact: 29 }
/** Порог числа строк, выше которого включаем виртуализацию.
 *  Ниже — обычный render (проще, без spacer-строк, нет дёрганья при resize). */
const VIRTUALIZE_THRESHOLD = 80

const DENSITY_LS_KEY = 'cc-list-density'
type Density = 'comfortable' | 'compact'

function readDensity(): Density {
  if (typeof window === 'undefined') return 'comfortable'
  return window.localStorage.getItem(DENSITY_LS_KEY) === 'compact' ? 'compact' : 'comfortable'
}

/** Колбэки/флаги для строки таблицы (виртуализация + навигация + плотность). */
export type RowRenderMeta = {
  measureRef?: (el: HTMLTableRowElement | null) => void
  dataIndex?: number
  /** Строка под клавиатурным фокусом (↑/↓) — подсветка. */
  focused?: boolean
  /** Компактная плотность строк. */
  dense?: boolean
}

export type TableShellColumn = {
  key: string
  width: number
  def: NonNullable<ReturnType<typeof getColumnDef>>
  /** Режим отображения для колонок-людей (исполнители/участники). */
  display?: 'avatars' | 'names'
}

type TableShellProps<T extends { id: string }> = {
  isLoading: boolean
  isEmpty: boolean
  total: number
  columns: TableShellColumn[]
  selectedIds: Set<string>
  allItemIds: string[]
  onSelectedChange: (next: Set<string>) => void
  onResizeCommit: (key: string, width: number) => void
  bulkActions: React.ReactNode
  renderRow: (item: T, meta: RowRenderMeta) => React.ReactNode
  items: T[]
  /** Открыть строку (Enter / клик). Используется клавиатурной навигацией. */
  onActivateRow?: (item: T) => void
}

export function TableShell<T extends { id: string }>({
  isLoading, isEmpty, total, columns, selectedIds, allItemIds,
  onSelectedChange, onResizeCommit, bulkActions, renderRow, items, onActivateRow,
}: TableShellProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualize = items.length > VIRTUALIZE_THRESHOLD

  const [density, setDensity] = useState<Density>(readDensity)
  const dense = density === 'compact'

  // Клавиатурная навигация: индекс строки под фокусом (↑/↓), Enter открывает,
  // Space переключает чекбокс. focusedIndex держим в ref, чтобы memo-строки не
  // перерисовывались все при каждом шаге (только старая и новая focused-строка).
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE[density],
    overscan: 12,
    // Когда виртуализация выключена — отдаём пустой набор, рендерим всё обычным map.
    enabled: virtualize,
  })

  const virtualRows = virtualize ? rowVirtualizer.getVirtualItems() : []
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0

  const allChecked = allItemIds.length > 0 && allItemIds.every((id) => selectedIds.has(id))
  const someChecked = !allChecked && allItemIds.some((id) => selectedIds.has(id))

  const toggleAll = () => {
    if (allChecked) {
      const next = new Set(selectedIds)
      allItemIds.forEach((id) => next.delete(id))
      onSelectedChange(next)
    } else {
      const next = new Set(selectedIds)
      allItemIds.forEach((id) => next.add(id))
      onSelectedChange(next)
    }
  }

  const toggleDensity = () => {
    const next: Density = dense ? 'comfortable' : 'compact'
    setDensity(next)
    if (typeof window !== 'undefined') window.localStorage.setItem(DENSITY_LS_KEY, next)
  }

  const scrollToRow = useCallback(
    (index: number) => {
      if (virtualize) {
        rowVirtualizer.scrollToIndex(index, { align: 'auto' })
      } else {
        scrollRef.current
          ?.querySelector(`[data-index="${index}"]`)
          ?.scrollIntoView({ block: 'nearest' })
      }
    },
    [virtualize, rowVirtualizer],
  )

  const toggleSelect = useCallback(
    (id: string) => {
      const next = new Set(selectedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      onSelectedChange(next)
    },
    [selectedIds, onSelectedChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Не перехватываем ввод в полях / попапах (поиск исполнителей и т.п.).
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
      if (items.length === 0) return

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex((cur) => {
          const base = cur ?? -1
          const next = e.key === 'ArrowDown'
            ? Math.min(items.length - 1, base + 1)
            : Math.max(0, base + (cur === null ? 1 : -1))
          scrollToRow(next)
          return next
        })
      } else if (e.key === 'Enter' && focusedIndex != null) {
        e.preventDefault()
        onActivateRow?.(items[focusedIndex])
      } else if (e.key === ' ' && focusedIndex != null) {
        e.preventDefault()
        toggleSelect(items[focusedIndex].id)
      }
    },
    [items, focusedIndex, scrollToRow, onActivateRow, toggleSelect],
  )

  // Клик по строке делает её активной для последующей навигации с клавиатуры.
  const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const tr = (e.target as HTMLElement).closest('[data-index]')
    const idx = tr?.getAttribute('data-index')
    if (idx != null) setFocusedIndex(Number(idx))
  }, [])

  const buildMeta = (index: number, measureRef?: RowRenderMeta['measureRef']): RowRenderMeta => ({
    measureRef,
    dataIndex: index,
    focused: focusedIndex === index,
    dense,
  })

  return (
    <>
      {selectedIds.size > 0 && (
        <div className="px-6 py-2 border-b bg-primary/5 flex items-center gap-3 text-sm">
          <span className="font-medium">{selectedIds.size} выделено</span>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onSelectedChange(new Set())}
          >
            Снять выделение
          </button>
          <div className="ml-auto flex items-center gap-2">{bulkActions}</div>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto bg-white focus:outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={handleContainerClick}
      >
        <table
          className={cn('text-sm border-collapse table-fixed', dense && '[&_td]:!py-1')}
          style={{ width: CHECKBOX_COL_WIDTH + columns.reduce((s, c) => s + c.width, 0) }}
        >
          <colgroup>
            <col style={{ width: CHECKBOX_COL_WIDTH }} />
            {columns.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 bg-white border-b z-10">
            <tr>
              <th className="px-3 py-2 text-left">
                <Checkbox
                  checked={allChecked || (someChecked ? 'indeterminate' : false)}
                  onCheckedChange={toggleAll}
                />
              </th>
              {columns.map((c, idx) => (
                <th
                  key={c.key}
                  className="relative text-left text-xs font-medium text-muted-foreground px-3 py-2 truncate select-none"
                >
                  {c.def.label}
                  <ColumnResizeHandle
                    columnKey={c.key}
                    colIndex={idx + 1}
                    minWidth={c.def.minWidth}
                    onCommit={onResizeCommit}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={columns.length + 1} className="px-3 py-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline-block mr-1.5" />
                Загружаю…
              </td></tr>
            )}
            {!isLoading && isEmpty && (
              <tr><td colSpan={columns.length + 1} className="px-3 py-12 text-center text-sm text-muted-foreground">
                Нет элементов, удовлетворяющих фильтру
              </td></tr>
            )}
            {!isLoading && !isEmpty && !virtualize &&
              items.map((item, idx) => renderRow(item, buildMeta(idx)))}
            {!isLoading && !isEmpty && virtualize && (
              <>
                {paddingTop > 0 && (
                  <tr aria-hidden style={{ height: paddingTop }}>
                    <td colSpan={columns.length + 1} className="p-0 border-0" />
                  </tr>
                )}
                {virtualRows.map((vr) =>
                  renderRow(items[vr.index], buildMeta(vr.index, rowVirtualizer.measureElement)),
                )}
                {paddingBottom > 0 && (
                  <tr aria-hidden style={{ height: paddingBottom }}>
                    <td colSpan={columns.length + 1} className="p-0 border-0" />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
        {!isLoading && !isEmpty && (
          <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-white flex items-center gap-3 sticky bottom-0">
            <span>Всего: {total}</span>
            <button
              type="button"
              onClick={toggleDensity}
              className="ml-auto flex items-center gap-1 hover:text-foreground transition-colors"
              title={dense ? 'Обычная плотность' : 'Компактная плотность'}
            >
              {dense ? <Rows3 className="h-3.5 w-3.5" /> : <Rows4 className="h-3.5 w-3.5" />}
              {dense ? 'Обычно' : 'Компактно'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
