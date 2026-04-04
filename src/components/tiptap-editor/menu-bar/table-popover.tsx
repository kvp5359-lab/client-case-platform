"use client"

import { memo } from 'react'
import { type Editor } from '@tiptap/react'
import { Table as TableIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface TablePopoverProps {
  editor: Editor
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Типобезопасные действия с таблицей
type TableAction =
  | 'addRowAfter'
  | 'addRowBefore'
  | 'addColumnAfter'
  | 'addColumnBefore'
  | 'deleteRow'
  | 'deleteColumn'
  | 'deleteTable'

function executeTableAction(editor: Editor, action: TableAction): void {
  const chain = editor.chain().focus()
  switch (action) {
    case 'addRowAfter':
      chain.addRowAfter().run()
      break
    case 'addRowBefore':
      chain.addRowBefore().run()
      break
    case 'addColumnAfter':
      chain.addColumnAfter().run()
      break
    case 'addColumnBefore':
      chain.addColumnBefore().run()
      break
    case 'deleteRow':
      chain.deleteRow().run()
      break
    case 'deleteColumn':
      chain.deleteColumn().run()
      break
    case 'deleteTable':
      chain.deleteTable().run()
      break
  }
}

/**
 * Popup для работы с таблицами
 */
export const TablePopover = memo(function TablePopover({
  editor,
  open,
  onOpenChange,
}: TablePopoverProps) {
  const isInTable = editor.isActive('table')

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-2.5 min-w-9 transition-colors hover:bg-muted hover:text-muted-foreground',
            isInTable && 'bg-accent text-accent-foreground',
          )}
          title="Таблица"
        >
          <TableIcon className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1">
        <div className="flex flex-col">
          {!isInTable ? (
            <>
              <p className="px-2 py-1 text-xs text-muted-foreground font-medium">
                Вставить таблицу
              </p>
              {[
                { rows: 2, cols: 2, label: '2x2' },
                { rows: 3, cols: 3, label: '3x3' },
                { rows: 4, cols: 4, label: '4x4' },
                { rows: 3, cols: 5, label: '3x5' },
              ].map(({ rows, cols, label }) => (
                <button
                  key={label}
                  type="button"
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted text-left"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
                    onOpenChange(false)
                  }}
                >
                  {label}
                </button>
              ))}
            </>
          ) : (
            <>
              {/* Добавление строк/колонок */}
              {[
                { action: 'addRowAfter' as TableAction, label: '+ Строка снизу' },
                { action: 'addRowBefore' as TableAction, label: '+ Строка сверху' },
                { action: 'addColumnAfter' as TableAction, label: '+ Колонка справа' },
                { action: 'addColumnBefore' as TableAction, label: '+ Колонка слева' },
              ].map(({ action, label }) => (
                <button
                  key={action}
                  type="button"
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted text-left"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    executeTableAction(editor, action)
                    onOpenChange(false)
                  }}
                >
                  {label}
                </button>
              ))}
              <div className="h-px bg-border my-1" />
              {/* Удаление */}
              {[
                { action: 'deleteRow' as TableAction, label: 'Удалить строку' },
                { action: 'deleteColumn' as TableAction, label: 'Удалить колонку' },
                { action: 'deleteTable' as TableAction, label: 'Удалить таблицу' },
              ].map(({ action, label }) => (
                <button
                  key={action}
                  type="button"
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted text-left text-destructive"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    executeTableAction(editor, action)
                    onOpenChange(false)
                  }}
                >
                  {label}
                </button>
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
})
