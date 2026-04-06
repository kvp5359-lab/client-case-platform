"use client"

/**
 * Компонент строки документа из источника (Google Drive)
 */

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  MoreVertical,
  Download,
  FolderInput,
  Eye,
  EyeOff,
  SquareArrowOutUpRight,
} from 'lucide-react'
import { SourceDocumentRowProps } from './types'
import { formatSize } from '@/utils/files/formatSize'
import { formatShortDate } from '@/utils/format/dateFormat'

export function SourceDocumentRow({
  file,
  isSelected,
  hasSelection,
  isDragging,
  onSelect,
  onToggleHidden,
  onDownload,
  onMove,
  onDragStart,
  onDragEnd,
}: SourceDocumentRowProps) {
  return (
    <tr
      className={`group h-7 transition-opacity ${
        isDragging ? 'opacity-40 cursor-grabbing' : 'hover:bg-muted/30 cursor-grab'
      }`}
      draggable
      onDragStart={(e) => onDragStart(e, file)}
      onDragEnd={onDragEnd}
    >
      {/* Колонка: Название */}
      <td className="py-1 pl-1.5 pr-3 relative border-b border-gray-100">
        <div className="flex items-center justify-between gap-2 min-w-0 relative">
          <div className="flex items-center gap-2 min-w-0">
            <Checkbox
              checked={isSelected}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation()
                onSelect(file.id, e)
              }}
              className={`transition-opacity flex-shrink-0 ${hasSelection ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            />
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                type="button"
                aria-label={file.isHidden ? 'Показать документ' : 'Скрыть документ'}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleHidden(file.id)
                }}
                className="flex-shrink-0 hover:bg-accent rounded p-0.5 transition-colors"
                title={file.isHidden ? 'Показать документ' : 'Скрыть документ'}
              >
                {file.isHidden ? (
                  <EyeOff className="h-3 w-3 text-muted-foreground/40" />
                ) : (
                  <Eye className="h-3 w-3 text-muted-foreground" />
                )}
              </button>
              <span
                className={`text-sm truncate ${file.isHidden ? 'text-purple-300' : 'text-purple-700'}`}
              >
                {file.name}
              </span>
              {file.webViewLink && (
                <button
                  type="button"
                  className="flex-shrink-0 p-0.5 rounded hover:bg-accent text-muted-foreground/40 hover:text-muted-foreground transition-all opacity-0 group-hover:opacity-100"
                  title="Открыть документ"
                  onClick={(e) => {
                    e.stopPropagation()
                    window.open(file.webViewLink, '_blank', 'noopener,noreferrer')
                  }}
                >
                  <SquareArrowOutUpRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Меню действий */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0 flex-shrink-0"
                  aria-label="Действия с документом"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {file.webViewLink && (
                  <DropdownMenuItem
                    onClick={() => window.open(file.webViewLink, '_blank', 'noopener,noreferrer')}
                  >
                    <SquareArrowOutUpRight className="h-3.5 w-3.5 mr-2" />
                    Открыть документ
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onDownload(file)}>
                  <Download className="h-3.5 w-3.5 mr-2" />
                  Скачать файл
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onMove(file)}>
                  <FolderInput className="h-3.5 w-3.5 mr-2" />
                  Переместить в группу
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </td>

      {/* Колонка: Размер */}
      <td className="py-1 px-3 relative truncate text-xs text-gray-400 text-right border-b border-gray-100">
        <div className="absolute left-0 top-2 bottom-2 w-px bg-border" />
        {file.size ? formatSize(file.size) : '—'}
      </td>

      {/* Колонка: Дата изменения */}
      <td className="py-1 pr-3 pl-2 relative truncate text-xs text-gray-400 text-right border-b border-gray-100">
        <div className="absolute left-0 top-2 bottom-2 w-px bg-border" />
        {file.modifiedTime ? formatShortDate(file.modifiedTime) : '—'}
      </td>
    </tr>
  )
}
