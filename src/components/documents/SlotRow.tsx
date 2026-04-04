"use client"

/**
 * Компоненты пустых слотов
 */

import { memo, useState, useCallback } from 'react'
import { FileUp, Pencil, Trash2, MoreVertical, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CommentBadge } from '@/components/comments'
import { sanitizeHtml } from '@/utils/sanitizeHtml'
import type { FolderSlotWithDocument, SourceDocumentInfo } from './types'
import {
  useDocumentKitHandlers,
  useDocumentKitUIState,
  useDocumentKitIds,
} from '@/components/projects/DocumentKitsTab/context'

/**
 * Строка таблицы со всеми пустыми слотами в одну линию
 */
export const EmptySlotsRow = memo(function EmptySlotsRow({
  slots,
}: {
  slots: FolderSlotWithDocument[]
}) {
  if (slots.length === 0) return null

  return (
    <tr>
      <td className="pt-2.5 pb-2.5 px-3" colSpan={4}>
        <div className="flex flex-wrap items-center gap-1 ml-6">
          {slots.map((slot) => (
            <EmptySlotChip key={slot.id} slot={slot} />
          ))}
        </div>
      </td>
    </tr>
  )
})

/**
 * Один пустой слот — компактный inline-чип с пунктирной рамкой
 */
const EmptySlotChip = memo(function EmptySlotChip({ slot }: { slot: FolderSlotWithDocument }) {
  const handlers = useDocumentKitHandlers()
  const { editingSlotId } = useDocumentKitUIState()
  const { projectId, workspaceId } = useDocumentKitIds()
  const isNewSlot = editingSlotId === slot.id
  const [menuOpen, setMenuOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(isNewSlot)
  const [editName, setEditName] = useState(isNewSlot ? '' : slot.name)
  const [isDragOver, setIsDragOver] = useState(false)
  // Z3-07: стандартный React-паттерн "Adjusting state when a prop changes"
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  // eslint-disable-next-line react-hooks/set-state-in-effect -- render-phase setState по документации React
  const [prevIsNewSlot, setPrevIsNewSlot] = useState(isNewSlot)
  if (isNewSlot !== prevIsNewSlot) {
    setPrevIsNewSlot(isNewSlot)
    if (isNewSlot) {
      setIsEditing(true)
      setEditName('')
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)
      const isSourceDoc = e.dataTransfer.getData('application/x-source-doc') === 'true'
      if (isSourceDoc) {
        // Читаем данные из dataTransfer — не зависим от React state
        const sourceDocJson = e.dataTransfer.getData('application/x-source-doc-json')
        let sourceDoc: SourceDocumentInfo | null = null
        if (sourceDocJson) {
          try {
            const parsed = JSON.parse(sourceDocJson)
            if (parsed && typeof parsed === 'object' && 'id' in parsed && 'name' in parsed) {
              sourceDoc = parsed as SourceDocumentInfo
            }
          } catch {
            /* corrupted drag data */
          }
        }
        if (sourceDoc) {
          handlers.onSlotDropSourceDoc(slot.id, slot.folder_id, sourceDoc)
          return
        }
      }
      const documentId = e.dataTransfer.getData('application/x-document-id')
      if (documentId) {
        handlers.onSlotDrop(slot.id, documentId)
      }
    },
    [handlers, slot.id, slot.folder_id],
  )

  const handleRename = () => {
    if (editName.trim() && editName.trim() !== slot.name) {
      handlers.onSlotRename(slot.id, editName.trim())
    }
    setIsEditing(false)
    if (isNewSlot) handlers.onClearEditingSlot()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`group/chip inline-flex items-center gap-1.5 border border-dashed rounded-full px-2 py-px cursor-pointer transition-colors ${
        isDragOver
          ? 'border-blue-500 bg-blue-50'
          : 'border-muted-foreground/30 hover:border-muted-foreground/50 hover:bg-muted/20'
      }`}
      onClick={() => handlers.onSlotClick(slot.id, slot.folder_id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handlers.onSlotClick(slot.id, slot.folder_id)
        }
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <FileUp className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
      {isEditing ? (
        <input
          autoFocus
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRename()
            if (e.key === 'Escape') {
              setEditName(slot.name)
              setIsEditing(false)
              if (isNewSlot) handlers.onClearEditingSlot()
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className="text-xs bg-transparent border-b border-muted-foreground/30 outline-none py-0 px-0 max-w-[200px]"
        />
      ) : (
        <span className="text-xs text-muted-foreground/50 italic">{slot.name}</span>
      )}

      {/* Описание слота — иконка ? с попапом */}
      {slot.description && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="p-0 rounded text-blue-500/70 hover:text-blue-500 transition-colors flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <HelpCircle className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            className="max-w-[320px] text-xs prose prose-sm prose-slate max-h-[200px] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(slot.description) }} />
          </PopoverContent>
        </Popover>
      )}

      {/* Комментарии — видны всегда при наличии */}
      <CommentBadge
        entityType="folder_slot"
        entityId={slot.id}
        projectId={projectId || ''}
        workspaceId={workspaceId || ''}
        emptyClassName="opacity-0 group-hover/chip:opacity-100"
      />
      {/* Меню слота */}
      <div className="opacity-0 group-hover/chip:opacity-100 transition-opacity flex-shrink-0 flex items-center">
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                setIsEditing(true)
                setMenuOpen(false)
              }}
            >
              <Pencil className="h-3 w-3 mr-2" />
              Переименовать
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                handlers.onSlotDelete(slot.id)
              }}
            >
              <Trash2 className="h-3 w-3 mr-2" />
              Удалить слот
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
})
