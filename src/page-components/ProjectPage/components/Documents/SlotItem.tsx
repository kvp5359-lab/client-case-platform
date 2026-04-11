"use client"

/**
 * Элемент слота в карточном представлении
 *
 * Заполненный слот рендерит DocumentItem напрямую (без дублирования UI).
 * Пустой слот — пунктирная рамка с иконкой загрузки + drop target.
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { FileUp, Pencil, Trash2, Loader2, HelpCircle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DocumentItem } from './DocumentItem'
import { useDocumentsContext } from './DocumentsContext'
import { sanitizeHtml } from '@/utils/format/sanitizeHtml'
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
  const {
    uploadingSlotId,
    onSourceDocSlotDrop,
    onMessengerAttachmentSlotDrop,
  } = useDocumentsContext()
  const doc = slot.document
  const isUploading = uploadingSlotId === slot.id
  const isEmpty = !slot.document_id
  const startInEditMode = !!(isNew && isEmpty)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isDropLoading, setIsDropLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(startInEditMode)
  const [editName, setEditName] = useState(startInEditMode ? '' : slot.name)

  // Сбрасываем isDropLoading когда слот заполнился (document_id появился)
  useEffect(() => {
    if (slot.document_id) setIsDropLoading(false)
  }, [slot.document_id])
  const onNewSlotCreatedRef = useRef(onNewSlotCreated)
  useEffect(() => {
    onNewSlotCreatedRef.current = onNewSlotCreated
  })

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // source doc и обычные документы используют effectAllowed='move',
    // messenger attachments — 'copy'
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-messenger-attachment')
      ? 'copy'
      : 'move'
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

      // Source doc drop — from Google Drive source
      const isSourceDoc = e.dataTransfer.getData('application/x-source-doc') === 'true'
      if (isSourceDoc) {
        const json = e.dataTransfer.getData('application/x-source-doc-json')
        if (json) {
          setIsDropLoading(true)
          onSourceDocSlotDrop(json, slot.id, slot.folder_id)
        }
        return
      }

      // Messenger attachment drop
      const isMessengerAttachment =
        e.dataTransfer.getData('application/x-messenger-attachment') === 'true'
      if (isMessengerAttachment) {
        const json = e.dataTransfer.getData('application/x-messenger-attachment-json')
        if (json) {
          setIsDropLoading(true)
          onMessengerAttachmentSlotDrop(json, slot.id, slot.folder_id)
        }
        return
      }

      // Regular document drop
      const documentId = e.dataTransfer.getData('application/x-document-id')
      if (documentId && onSlotDrop) {
        onSlotDrop(slot.id, documentId)
      }
    },
    [onSlotDrop, onSourceDocSlotDrop, onMessengerAttachmentSlotDrop, slot.id, slot.folder_id],
  )

  // Notify parent that new slot was created (runs once on mount)
  useEffect(() => {
    if (startInEditMode) {
      onNewSlotCreatedRef.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRename = useCallback(() => {
    if (editName.trim() && editName.trim() !== slot.name && onSlotRename) {
      onSlotRename(slot.id, editName.trim())
    }
    setIsEditing(false)
  }, [editName, slot.name, slot.id, onSlotRename])

  // Пустой слот — пунктирная капсула (плитка)
  if (isEmpty) {
    // Состояние загрузки — показываем прогресс-бар внутри слота
    if (isUploading || isDropLoading) {
      return (
        <div className="relative inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-brand-500 bg-brand-50 overflow-hidden">
          <Loader2 className="h-3 w-3 flex-shrink-0 text-brand-500 animate-spin" />
          <span className="min-w-0 text-sm truncate text-brand-600">Загрузка...</span>
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-brand-100">
            <div className="h-full bg-brand-500 rounded-full animate-progress-indeterminate" />
          </div>
        </div>
      )
    }

    return (
      <div
        role="button"
        tabIndex={0}
        className={`group/slot inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-dashed transition-all duration-200 cursor-pointer ${
          isDragOver
            ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500'
            : 'border-brand-500 hover:border-brand-600 hover:bg-brand-50'
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
          className={`h-4 w-4 flex-shrink-0 transition-all duration-200 ${isDragOver ? 'text-brand-500' : 'text-brand-600 group-hover/slot:text-brand-700 group-hover/slot:-translate-y-0.5'}`}
        />
        {isEditing ? (
          <div className="relative inline-grid items-center min-w-[80px]">
            <span className="invisible whitespace-pre text-sm px-0 col-start-1 row-start-1">
              {editName || ' '}
            </span>
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
              className="text-sm bg-transparent border-b border-muted-foreground/30 outline-none py-0 px-0 w-full col-start-1 row-start-1"
            />
          </div>
        ) : (
          <span
            className={`min-w-0 text-sm truncate transition-colors duration-200 ${isDragOver ? 'text-brand-600' : 'text-brand-600 group-hover/slot:text-brand-700'}`}
          >
            {slot.name}
          </span>
        )}
        {!isEditing && !isDragOver && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {slot.description && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="p-0.5 rounded text-brand-500 hover:text-brand-600 transition-colors"
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
            <div className="flex items-center gap-0.5 opacity-0 group-hover/slot:opacity-100 transition-opacity">
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
          </div>
        )}
      </div>
    )
  }

  // Заполненный слот — рендерит DocumentItem напрямую
  if (!doc) return null

  return <DocumentItem document={doc} slotId={slot.id} />
})
