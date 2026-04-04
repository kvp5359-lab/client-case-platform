"use client"

/**
 * Элемент слота в карточном представлении
 *
 * Заполненный слот рендерит DocumentItem напрямую (без дублирования UI).
 * Пустой слот — пунктирная рамка с иконкой загрузки + drop target.
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { FileUp, Pencil, Trash2, Loader2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CommentBadge } from '@/components/comments'
import { DocumentItem } from './DocumentItem'
import { useCardViewContext } from './CardViewContext'
import type { FolderSlotWithDocument } from '@/components/documents/types'

export interface SlotItemProps {
  slot: FolderSlotWithDocument
  onSlotClick: (slotId: string, folderId: string) => void
  onSlotDrop?: (slotId: string, documentId: string) => void
  onSlotDelete?: (slotId: string) => void
  onSlotRename?: (slotId: string, name: string) => void
  isNew?: boolean
  onNewSlotCreated?: () => void
}

export const SlotItem = memo(function SlotItem({
  slot,
  onSlotClick,
  onSlotDrop,
  onSlotDelete,
  onSlotRename,
  isNew,
  onNewSlotCreated,
}: SlotItemProps) {
  const { projectId, workspaceId, uploadingSlotId } = useCardViewContext()
  const doc = slot.document
  const isUploading = uploadingSlotId === slot.id
  const isEmpty = !slot.document_id
  const startInEditMode = !!(isNew && isEmpty)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isEditing, setIsEditing] = useState(startInEditMode)
  const [editName, setEditName] = useState(startInEditMode ? '' : slot.name)
  const onNewSlotCreatedRef = useRef(onNewSlotCreated)
  useEffect(() => {
    onNewSlotCreatedRef.current = onNewSlotCreated
  })

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
      const documentId = e.dataTransfer.getData('application/x-document-id')
      if (documentId && onSlotDrop) {
        onSlotDrop(slot.id, documentId)
      }
    },
    [onSlotDrop, slot.id],
  )

  // Notify parent that new slot was created (runs once on mount)
  useEffect(() => {
    if (startInEditMode) {
      onNewSlotCreated?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRename = useCallback(() => {
    if (editName.trim() && editName.trim() !== slot.name && onSlotRename) {
      onSlotRename(slot.id, editName.trim())
    }
    setIsEditing(false)
  }, [editName, slot.name, slot.id, onSlotRename])

  // Пустой слот — пунктирная рамка с drop target
  if (isEmpty) {
    // Состояние загрузки — показываем прогресс-бар внутри слота
    if (isUploading) {
      return (
        <div className="relative flex items-center gap-2 py-1.5 px-3 rounded-full border border-blue-300 bg-blue-50 overflow-hidden">
          <Loader2 className="h-3.5 w-3.5 flex-shrink-0 text-blue-500 animate-spin" />
          <span className="flex-1 min-w-0 text-sm truncate text-blue-600">Загрузка...</span>
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-blue-100">
            <div className="h-full bg-blue-500 rounded-full animate-progress-indeterminate" />
          </div>
        </div>
      )
    }

    return (
      <div
        role="button"
        tabIndex={0}
        className={`group/slot flex items-center gap-2 py-1.5 px-3 rounded-full border border-dashed transition-colors cursor-pointer ${
          isDragOver
            ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-400'
            : 'border-foreground/20 hover:bg-muted/30'
        }`}
        onClick={() => !isEditing && onSlotClick(slot.id, slot.folder_id)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isEditing) {
            e.preventDefault()
            onSlotClick(slot.id, slot.folder_id)
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <FileUp
          className={`h-3.5 w-3.5 flex-shrink-0 ${isDragOver ? 'text-blue-500' : 'text-muted-foreground/40'}`}
        />
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
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="text-sm bg-transparent border-b border-muted-foreground/30 outline-none py-0 px-0 flex-1 min-w-0"
          />
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={`flex-1 min-w-0 text-sm truncate italic ${isDragOver ? 'text-blue-600' : 'text-muted-foreground/60'}`}
              >
                {isDragOver ? '↓ Отпустите для привязки' : slot.name}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-sm">
              <p>{slot.name}</p>
            </TooltipContent>
          </Tooltip>
        )}
        {/* Комментарии — видны всегда при наличии */}
        {!isEditing && !isDragOver && projectId && workspaceId && (
          <CommentBadge
            entityType="folder_slot"
            entityId={slot.id}
            projectId={projectId}
            workspaceId={workspaceId}
            emptyClassName="opacity-0 group-hover/slot:opacity-100"
          />
        )}
        {!isEditing && !isDragOver && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover/slot:opacity-100 transition-opacity flex-shrink-0">
            <button
              type="button"
              className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                setEditName(slot.name)
                setIsEditing(true)
              }}
              title="Переименовать"
            >
              <Pencil className="h-3 w-3" />
            </button>
            {onSlotDelete && (
              <button
                type="button"
                className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  onSlotDelete(slot.id)
                }}
                title="Удалить слот"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // Заполненный слот — рендерит DocumentItem напрямую
  if (!doc) return null

  return <DocumentItem document={doc} slotId={slot.id} />
})
