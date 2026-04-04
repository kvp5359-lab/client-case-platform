import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Native HTML Table Component
 * Используется для компактных таблиц с высокой плотностью информации
 * (списки документов, поля форм, секции шаблонов и т.д.)
 */

interface NativeTableProps extends React.HTMLAttributes<HTMLTableElement> {
  columns?: Array<{
    key: string
    width: string // "41%", "7%", "60px", etc.
  }>
}

const NativeTable = React.forwardRef<HTMLTableElement, NativeTableProps>(
  ({ className, columns, children, ...props }, ref) => (
    <table ref={ref} className={cn('w-full table-fixed border-collapse', className)} {...props}>
      {columns && (
        <colgroup>
          {columns.map((col) => (
            <col key={col.key} style={{ width: col.width }} />
          ))}
        </colgroup>
      )}
      {children}
    </table>
  ),
)
NativeTable.displayName = 'NativeTable'

const NativeTableHead = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => <thead ref={ref} className={cn('', className)} {...props} />)
NativeTableHead.displayName = 'NativeTableHead'

const NativeTableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => <tbody ref={ref} className={cn('', className)} {...props} />)
NativeTableBody.displayName = 'NativeTableBody'

interface NativeTableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  isHeader?: boolean
  isSection?: boolean
  isCollapsed?: boolean
}

const NativeTableRow = React.forwardRef<HTMLTableRowElement, NativeTableRowProps>(
  ({ className, isHeader, isSection, isCollapsed: _isCollapsed, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'transition-colors',
        isHeader && 'bg-gray-50 border-b border-border',
        isSection && 'bg-gray-100 hover:bg-gray-200 h-8',
        !isHeader && !isSection && 'border-t border-border hover:bg-muted/30 h-6',
        className,
      )}
      {...props}
    />
  ),
)
NativeTableRow.displayName = 'NativeTableRow'

interface NativeTableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  withDivider?: boolean
  isNumeric?: boolean
}

const NativeTableCell = React.forwardRef<HTMLTableCellElement, NativeTableCellProps>(
  ({ className, withDivider = true, isNumeric, ...props }, ref) => (
    <td
      ref={ref}
      className={cn(
        'py-0.5 px-3 relative text-sm align-middle',
        'before:absolute before:right-0 before:top-1 before:bottom-1 before:w-px before:bg-border',
        !withDivider && 'before:hidden',
        isNumeric && 'text-right',
        className,
      )}
      {...props}
    />
  ),
)
NativeTableCell.displayName = 'NativeTableCell'

interface NativeTableHeadCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  withDivider?: boolean
  isNumeric?: boolean
}

const NativeTableHeadCell = React.forwardRef<HTMLTableCellElement, NativeTableHeadCellProps>(
  ({ className, withDivider = true, isNumeric, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'py-2 px-3 text-left font-medium text-sm text-muted-foreground align-middle',
        'before:absolute before:right-0 before:top-2 before:bottom-2 before:w-px before:bg-border relative',
        !withDivider && 'before:hidden',
        isNumeric && 'text-right',
        className,
      )}
      {...props}
    />
  ),
)
NativeTableHeadCell.displayName = 'NativeTableHeadCell'

export {
  NativeTable,
  NativeTableHead,
  NativeTableBody,
  NativeTableRow,
  NativeTableCell,
  NativeTableHeadCell,
}
