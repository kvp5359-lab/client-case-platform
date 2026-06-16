"use client"

import { useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Checkbox } from '@/components/ui/checkbox'
import { ColumnResizeHandle } from './ColumnResizeHandle'
import type { getColumnDef } from './columns'

export const CHECKBOX_COL_WIDTH = 36

/** Оценка высоты строки (px) для виртуализатора. Уточняется measureElement'ом. */
const ROW_ESTIMATE = 37
/** Порог числа строк, выше которого включаем виртуализацию.
 *  Ниже — обычный render (проще, без spacer-строк, нет дёрганья при resize). */
const VIRTUALIZE_THRESHOLD = 80

/** Колбэки для виртуализованной строки: ref для measureElement + data-index. */
export type RowRenderMeta = {
  measureRef?: (el: HTMLTableRowElement | null) => void
  dataIndex?: number
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
}

export function TableShell<T extends { id: string }>({
  isLoading, isEmpty, total, columns, selectedIds, allItemIds,
  onSelectedChange, onResizeCommit, bulkActions, renderRow, items,
}: TableShellProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualize = items.length > VIRTUALIZE_THRESHOLD

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
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

      <div ref={scrollRef} className="flex-1 overflow-auto bg-white">
        <table
          className="text-sm border-collapse table-fixed"
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
              items.map((item) => renderRow(item, {}))}
            {!isLoading && !isEmpty && virtualize && (
              <>
                {paddingTop > 0 && (
                  <tr aria-hidden style={{ height: paddingTop }}>
                    <td colSpan={columns.length + 1} className="p-0 border-0" />
                  </tr>
                )}
                {virtualRows.map((vr) =>
                  renderRow(items[vr.index], {
                    measureRef: rowVirtualizer.measureElement,
                    dataIndex: vr.index,
                  }),
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
          <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-white">
            Всего: {total}
          </div>
        )}
      </div>
    </>
  )
}
