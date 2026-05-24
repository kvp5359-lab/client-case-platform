"use client"

import { Loader2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { ColumnResizeHandle } from './ColumnResizeHandle'
import type { getColumnDef } from './columns'

export const CHECKBOX_COL_WIDTH = 36

export type TableShellColumn = {
  key: string
  width: number
  def: NonNullable<ReturnType<typeof getColumnDef>>
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
  renderRow: (item: T) => React.ReactNode
  items: T[]
}

export function TableShell<T extends { id: string }>({
  isLoading, isEmpty, total, columns, selectedIds, allItemIds,
  onSelectedChange, onResizeCommit, bulkActions, renderRow, items,
}: TableShellProps<T>) {
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

      <div className="flex-1 overflow-auto bg-white">
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
            {!isLoading && !isEmpty && items.map(renderRow)}
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
