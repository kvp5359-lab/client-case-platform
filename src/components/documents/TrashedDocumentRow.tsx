"use client"

/**
 * Компонент строки документа в корзине
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical } from 'lucide-react'
import { TrashedDocumentRowProps } from './types'
import { formatSize } from '@/utils/files/formatSize'
import { getCurrentDocumentFile } from '@/utils/documentUtils'
import { formatShortDate } from '@/utils/format/dateFormat'

export function TrashedDocumentRow({
  document: doc,
  index,
  isSelected,
  hasSelection,
  isHovered,
  onSelect,
  onHover,
  onOpenEdit,
  onRestore,
  onDelete,
}: TrashedDocumentRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const currentFile = getCurrentDocumentFile(doc.document_files)

  return (
    <tr
      className="group h-7 hover:bg-muted/30"
      onMouseEnter={() => onHover(doc.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Колонка: Название */}
      <td className="py-0.5 pl-1.5 pr-3 border-b border-gray-100">
        <div className="flex items-center justify-between gap-2 min-w-0 relative">
          <div className="flex items-center gap-2 min-w-0">
            <Checkbox
              checked={isSelected}
              onClick={(e) => {
                e.stopPropagation()
                onSelect(doc.id, e as unknown as React.MouseEvent)
              }}
              className={`transition-opacity flex-shrink-0 ${hasSelection ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            />
            <div
              role="button"
              tabIndex={0}
              onClick={() => onOpenEdit(doc.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpenEdit(doc.id)
                }
              }}
              className="text-sm truncate min-w-0 hover:text-primary hover:underline cursor-pointer transition-colors text-left text-red-700"
            >
              {index + 1}. {doc.name}
            </div>
          </div>

          {/* Меню действий — показываем при hover ИЛИ открытом menu */}
          {(isHovered || menuOpen) && (
            <DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 flex-shrink-0"
                  aria-label="Действия с документом"
                >
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[100]">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    onRestore(doc.id)
                  }}
                >
                  Восстановить
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(doc.id)
                  }}
                >
                  Удалить навсегда
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </td>

      {/* Колонка: Размер */}
      <td className="py-1 px-3 relative truncate text-xs text-gray-400 text-right border-b border-gray-100">
        <div className="absolute left-0 top-2 bottom-2 w-px bg-border" />
        {currentFile ? formatSize(currentFile.file_size) : '—'}
      </td>

      {/* Колонка: Дата удаления */}
      <td className="py-1 pr-3 pl-2 relative truncate text-xs text-gray-400 text-right border-b border-gray-100">
        <div className="absolute left-0 top-2 bottom-2 w-px bg-border" />
        {doc.deleted_at ? formatShortDate(doc.deleted_at) : '—'}
      </td>
    </tr>
  )
}
