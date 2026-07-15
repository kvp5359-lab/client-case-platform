"use client"

/**
 * Элемент слота в карточном представлении
 *
 * Заполненный слот рендерит DocumentItem напрямую (без дублирования UI).
 * Пустой слот — пунктирная рамка с иконкой загрузки + drop target.
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { FileUp, Pencil, Trash2, Loader2 } from 'lucide-react'
import { AutoSizeInput } from '@/components/ui/auto-size-input'
import { DocumentItem } from './DocumentItem'
import { SlotHelpButton } from './SlotHelpButton'
import { useDocumentsContext } from './DocumentsContext'
import { SLOT_DND_MIME } from './hooks/useSlotsDragDrop'
import type { FolderSlotWithDocument } from '@/components/documents/types'

export type SlotItemProps = {
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
    draggedSlotId,
    dragOverSlotId,
    slotDragOverPosition,
    onSlotDragStart,
    onSlotItemDragOver,
    onSlotItemDragLeave,
    onSlotItemDragEnd,
    onSlotItemDrop,
  } = useDocumentsContext()
  const doc = slot.document
  const isUploading = uploadingSlotId === slot.id
  const isEmpty = !slot.document_id
  const isSlotDragging = draggedSlotId === slot.id
  const isSlotOver = dragOverSlotId === slot.id && draggedSlotId !== slot.id
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

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      // Перетаскивание другого слота — реордер, обрабатываем отдельно (линия сверху/снизу)
      if (e.dataTransfer.types.includes(SLOT_DND_MIME)) {
        onSlotItemDragOver(e, slot.id)
        return
      }
      e.preventDefault()
      e.stopPropagation()
      // source doc и обычные документы используют effectAllowed='move',
      // messenger attachments — 'copy'
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-messenger-attachment')
        ? 'copy'
        : 'move'
      setIsDragOver(true)
    },
    [onSlotItemDragOver, slot.id],
  )

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
    onSlotItemDragLeave()
  }, [onSlotItemDragLeave])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      // Реордер слотов
      if (e.dataTransfer.types.includes(SLOT_DND_MIME)) {
        onSlotItemDrop(e, slot)
        return
      }
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
    [
      onSlotDrop,
      onSourceDocSlotDrop,
      onMessengerAttachmentSlotDrop,
      onSlotItemDrop,
      slot,
    ],
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
        draggable={!isEditing}
        onDragStart={(e) => {
          if (isEditing) return
          onSlotDragStart(e, slot.id)
        }}
        onDragEnd={onSlotItemDragEnd}
        className={`group/slot relative inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-dashed transition-all duration-200 ${
          isEditing ? 'cursor-text' : 'cursor-grab active:cursor-grabbing'
        } ${isSlotDragging ? 'opacity-40' : ''} ${
          isDragOver
            ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500'
            : 'border-brand-500 hover:border-brand-600 hover:bg-brand-50'
        }`}
        onClick={(e) => {
          // React-события из Portal (Dialog с требованиями) пропагируют
          // через React-дерево, хотя в DOM рендерятся отдельно. Отсекаем —
          // реагируем только на клики внутри самого слота в DOM.
          if (!e.currentTarget.contains(e.target as Node)) return
          if (!isEditing) onSlotClick(slot.id, slot.folder_id)
        }}
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
        {isSlotOver && (
          <span
            className={`absolute left-1 right-1 h-0.5 rounded-full bg-brand-500 ${
              slotDragOverPosition === 'top' ? '-top-1' : '-bottom-1'
            }`}
          />
        )}
        <FileUp
          className={`h-4 w-4 flex-shrink-0 transition-all duration-200 ${isDragOver ? 'text-brand-500' : 'text-brand-600 group-hover/slot:text-brand-700 group-hover/slot:-translate-y-0.5'}`}
        />
        {isEditing ? (
          <AutoSizeInput
            autoFocus
            value={editName}
            onChange={setEditName}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename()
              if (e.key === 'Escape') {
                setEditName(slot.name)
                setIsEditing(false)
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="text-sm"
            inputClassName="border-b border-muted-foreground/30 py-0 px-0"
            containerClassName="relative items-center min-w-[80px]"
          />
        ) : (
          <span
            className={`min-w-0 text-sm truncate transition-colors duration-200 ${isDragOver ? 'text-brand-600' : 'text-brand-600 group-hover/slot:text-brand-700'}`}
          >
            {slot.name}
          </span>
        )}
        {!isEditing && !isDragOver && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <SlotHelpButton
              slotName={slot.name}
              description={slot.description}
              knowledgeArticleId={slot.knowledge_article_id}
            />
            <div className="md:hidden md:group-hover/slot:flex items-center gap-0.5">
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
