"use client"

/**
 * Элемент документа в карточном представлении
 * Рендерится как строка таблицы (tr) для выравнивания колонок.
 */

import { memo, useCallback, useState } from 'react'
import { SquareArrowOutUpRight, Minimize2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { DocumentActionsMenu } from '@/components/documents/DocumentActionsMenu'
import { CommentBadge } from '@/components/comments'
import type {
  DocumentActionPermissions,
  DocumentActionHandlers,
} from '@/components/documents/DocumentActionsMenu'
import { formatSize } from '@/utils/formatSize'
import { getCurrentDocumentFile } from '@/utils/documentUtils'
import { safeCssColor } from '@/utils/isValidCssColor'
import { useDocumentsContext } from './DocumentsContext'
import { DocumentStatusIconDropdown, DocumentStatusLabelDropdown } from './DocumentStatusDropdown'
import type { DocumentWithFiles } from '@/components/documents/types'

export interface DocumentItemProps {
  document: DocumentWithFiles
  slotId?: string
}

export const DocumentItem = memo(function DocumentItem({ document, slotId }: DocumentItemProps) {
  const {
    projectId,
    workspaceId,
    statuses,
    compressingDocIds,
    onStatusChange,
    onOpenEdit,
    onOpenDocument,
    onDownloadDocument,
    onDeleteDocument,
    onCompressDocument,
    onMoveDocument,
    onDuplicateDocument,
    onSlotUnlink,
    selectedDocuments,
    hasSelection,
    onSelectDocument,
    draggedDocId,
    dragOverDocId,
    dragOverPosition,
    onDocDragStart,
    onDocDragOver,
    onDocDragLeave,
    onDocDragEnd,
    onDocDrop,
    onSourceDocDrop,
    onMessengerAttachmentDrop,
    highlightedCompressDocIds,
  } = useDocumentsContext()

  const isSelected = selectedDocuments.has(document.id)
  const currentFile = getCurrentDocumentFile(document.document_files)
  const hasFile = (document.document_files?.length || 0) > 0
  const currentStatus = statuses.find((s) => s.id === document.status) || null
  const isFinal = !!currentStatus?.is_final
  const [menuOpen, setMenuOpen] = useState(false)

  const isDragging = draggedDocId === document.id
  const isOver = dragOverDocId === document.id && draggedDocId !== document.id
  const isHighlightedCompress = highlightedCompressDocIds.has(document.id)

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      onDocDragStart(e, document.id)
    },
    [onDocDragStart, document.id],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      onDocDragOver(e, document.id)
    },
    [onDocDragOver, document.id],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (e.dataTransfer.getData('application/x-source-doc') === 'true') {
        e.preventDefault()
        e.stopPropagation()
        const json = e.dataTransfer.getData('application/x-source-doc-json')
        if (json && document.folder_id) {
          onSourceDocDrop(json, document.folder_id, document.id, dragOverPosition)
        }
        onDocDragLeave()
        return
      }
      if (e.dataTransfer.getData('application/x-messenger-attachment') === 'true') {
        e.preventDefault()
        e.stopPropagation()
        const json = e.dataTransfer.getData('application/x-messenger-attachment-json')
        if (json && document.folder_id) {
          onMessengerAttachmentDrop(json, document.folder_id, document.id, dragOverPosition)
        }
        onDocDragLeave()
        return
      }
      onDocDrop(e, document)
    },
    [
      onDocDrop,
      onSourceDocDrop,
      onMessengerAttachmentDrop,
      onDocDragLeave,
      document,
      dragOverPosition,
    ],
  )

  const docPermissions: DocumentActionPermissions = {
    canView: !!onOpenDocument,
    canDownload: !!onDownloadDocument,
    canCompress: !!onCompressDocument,
    canMove: !!onMoveDocument,
    canDuplicate: !!onDuplicateDocument,
    canDelete: !!onDeleteDocument,
    canCreateTask: false,
  }

  const docHandlers: DocumentActionHandlers = {
    onOpenEdit: onOpenEdit,
    onOpenDocument: onOpenDocument || (() => {}),
    onDownload: onDownloadDocument || (() => {}),
    onCompress: onCompressDocument || (() => {}),
    onMove: onMoveDocument || (() => {}),
    onDuplicate: onDuplicateDocument || (() => {}),
    onDelete: onDeleteDocument || (() => {}),
    onSlotUnlink: slotId ? onSlotUnlink : undefined,
  }

  const statusColor = currentStatus ? safeCssColor(currentStatus.color) : null

  // Светлый непрозрачный фон из цвета статуса
  const statusBgColor = (() => {
    if (!statusColor) return '#f3f4f6'
    const hex = statusColor.replace('#', '')
    if (hex.length < 6) return '#f3f4f6'
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const mix = 0.85
    const lr = Math.round(r + (255 - r) * mix)
    const lg = Math.round(g + (255 - g) * mix)
    const lb = Math.round(b + (255 - b) * mix)
    return `rgb(${lr}, ${lg}, ${lb})`
  })()

  const cellClass = 'py-0.5 text-gray-500'

  return (
    <tr
      className={`group/doc hover:bg-gray-100/60 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50/60' : ''} ${isDragging ? 'opacity-40 bg-blue-50' : ''} ${isOver && dragOverPosition === 'top' ? 'border-t-2 border-t-blue-500 bg-blue-50/40' : ''} ${isOver && dragOverPosition === 'bottom' ? 'border-b-2 border-b-blue-500 bg-blue-50/40' : ''} ${isHighlightedCompress ? 'bg-orange-50/80 ring-1 ring-inset ring-orange-200' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={onDocDragLeave}
      onDrop={handleDrop}
      onDragEnd={onDocDragEnd}
      onClick={() => onOpenEdit(document.id)}
    >
      {/* Чекбокс */}
      <td className="py-0.5 pl-0 pr-0.5 w-0 align-top">
        <div className="flex items-center justify-center -ml-5" style={{ height: 20, width: 20 }}>
          <Checkbox
            checked={isSelected}
            onClick={(e) => {
              e.stopPropagation()
              onSelectDocument(document.id, e as unknown as React.MouseEvent)
            }}
            className={`transition-opacity flex-shrink-0 ${hasSelection || isSelected ? 'opacity-100' : 'opacity-0 group-hover/doc:opacity-100'}`}
          />
        </div>
      </td>
      {/* Контент */}
      <td className={`${cellClass} pl-0.5 pr-2.5`}>
        <div className="flex items-center gap-2.5 min-w-0" style={{ minHeight: 20, marginTop: -1 }}>
          <DocumentStatusIconDropdown
            documentId={document.id}
            currentStatus={currentStatus}
            statuses={statuses}
            onStatusChange={onStatusChange}
          />
          <span
            className={`min-w-0 text-[15px] leading-tight truncate ${!hasFile ? 'text-muted-foreground' : !currentStatus?.text_color ? (isFinal ? 'text-gray-400' : 'text-gray-900 font-medium') : 'font-medium'}`}
            style={
              currentStatus?.text_color
                ? { color: safeCssColor(currentStatus.text_color) }
                : undefined
            }
          >
            {document.name}
          </span>
          <DocumentStatusLabelDropdown
            documentId={document.id}
            currentStatus={currentStatus}
            statuses={statuses}
            statusBgColor={statusBgColor}
            onStatusChange={onStatusChange}
          />
          {/* Размер файла + иконка сжатия */}
          {hasFile && currentFile && (
            <span className="shrink-0 inline-flex items-center gap-0.5 text-[13px] leading-tight text-gray-300">
              {formatSize(currentFile.file_size || 0)}
              {currentFile.is_compressed && (
                <Minimize2 className="h-3 w-3 text-green-600" title="Документ сжат" />
              )}
            </span>
          )}
          {/* Комментарии, открыть, меню */}
          {!compressingDocIds.has(document.id) && projectId && workspaceId && (
            <CommentBadge
              entityType="document"
              entityId={document.id}
              projectId={projectId}
              workspaceId={workspaceId}
              emptyClassName="opacity-0 group-hover/doc:opacity-100"
            />
          )}
          <div
            className={`shrink-0 flex items-center gap-0.5 transition-opacity duration-150 ${compressingDocIds.has(document.id) ? 'hidden' : menuOpen ? 'opacity-100' : 'opacity-0 group-hover/doc:opacity-100'}`}
          >
            {hasFile && currentFile && (
              <button
                type="button"
                className="h-5 w-5 p-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenDocument(document.id)
                }}
                title="Открыть документ"
              >
                <SquareArrowOutUpRight className="h-3 w-3" />
              </button>
            )}
            {hasFile && currentFile && (
              <DocumentActionsMenu
                docId={document.id}
                currentFile={{ mime_type: currentFile.mime_type || '' }}
                handlers={docHandlers}
                permissions={docPermissions}
                compressingDocIds={compressingDocIds}
                onOpenChange={setMenuOpen}
                slotId={slotId}
              />
            )}
          </div>
          {/* Прогресс сжатия */}
          {compressingDocIds.has(document.id) && (
            <div className="shrink-0 flex items-center gap-1">
              <span className="text-[10px] text-orange-600 font-medium">Сжатие...</span>
              <div className="w-12 h-1 bg-orange-100 rounded-full overflow-hidden relative">
                <div className="absolute h-full w-1/2 bg-orange-500 rounded-full animate-[compress_1.5s_ease-in-out_infinite]" />
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
})
