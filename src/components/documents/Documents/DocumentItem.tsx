"use client"

/**
 * Элемент документа в карточном представлении
 * Рендерится как строка таблицы (tr) для выравнивания колонок.
 */

import { memo, useCallback, useState } from 'react'
import { SquareArrowOutUpRight, Minimize2 } from 'lucide-react'
import { isMobileViewport } from '@/lib/isMobile'
import { Checkbox } from '@/components/ui/checkbox'
import { DocumentActionsMenu } from '@/components/documents/DocumentActionsMenu'
import { CommentBadge } from '@/components/comments'
import type {
  DocumentActionPermissions,
  DocumentActionHandlers,
} from '@/components/documents/DocumentActionsMenu'
import { formatSize } from '@/utils/files/formatSize'
import { formatSmartDate } from '@/utils/format/dateFormat'
import { getCurrentDocumentFile } from '@/utils/documentUtils'
import { safeCssColor } from '@/utils/isValidCssColor'
import { useDocumentsContext } from './DocumentsContext'
import { SLOT_DND_MIME } from './hooks/useSlotsDragDrop'
import { DocumentStatusIconDropdown, DocumentStatusLabelDropdown } from './DocumentStatusDropdown'
import type { DocumentWithFiles } from '@/components/documents/types'

export type DocumentItemProps = {
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
    fileSizeWarnMb,
    fileSizeDangerMb,
  } = useDocumentsContext()

  const isSelected = selectedDocuments.has(document.id)
  const currentFile = getCurrentDocumentFile(document.document_files)

  // Подсветка тега размера по порогам из шаблона проекта. null → выключено.
  // Уже сжатые файлы подсвечиваем приглушённо — они уже оптимизированы.
  const sizeMb = (currentFile?.file_size || 0) / (1024 * 1024)
  const isOverDanger = fileSizeDangerMb != null && sizeMb >= fileSizeDangerMb
  const isOverWarn = fileSizeWarnMb != null && sizeMb >= fileSizeWarnMb
  const sizeCompressed = !!currentFile?.is_compressed
  const sizeColorClass = isOverDanger
    ? sizeCompressed
      ? 'text-red-300'
      : 'text-red-500 font-medium'
    : isOverWarn
      ? sizeCompressed
        ? 'text-amber-300'
        : 'text-amber-500 font-medium'
      : 'text-gray-400'
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
      // Слот тащат — не подсвечиваем строку документа, пусть всплывёт к папке
      if (e.dataTransfer.types.includes(SLOT_DND_MIME)) return
      onDocDragOver(e, document.id)
    },
    [onDocDragOver, document.id],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      // Слот нельзя вставить между документами — пропускаем дроп к карточке папки
      if (e.dataTransfer.types.includes(SLOT_DND_MIME)) return
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
      className={`group/doc border-b border-gray-100 hover:bg-gray-100/60 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50/60' : ''} ${isDragging ? 'opacity-40 bg-blue-50' : ''} ${isOver && dragOverPosition === 'top' ? 'border-t-2 border-t-blue-500 bg-blue-50/40' : ''} ${isOver && dragOverPosition === 'bottom' ? 'border-b-2 border-b-blue-500 bg-blue-50/40' : ''} ${isHighlightedCompress ? 'bg-orange-50/80 ring-1 ring-inset ring-orange-200' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={onDocDragLeave}
      onDrop={handleDrop}
      onDragEnd={onDocDragEnd}
      onClick={() => onOpenEdit(document.id)}
    >
      {/* Чекбокс */}
      <td className="py-0.5 pl-0 pr-0.5 w-0 align-middle">
        <div className="flex items-center justify-center -ml-5" style={{ height: 20, width: 20 }}>
          <Checkbox
            checked={isSelected}
            onClick={(e) => {
              e.stopPropagation()
              onSelectDocument(document.id, e as unknown as React.MouseEvent)
            }}
            className={`transition-opacity flex-shrink-0 ${hasSelection || isSelected ? 'opacity-100' : 'md:opacity-0 md:group-hover/doc:opacity-100'}`}
          />
        </div>
      </td>
      {/* Контент */}
      <td className={`${cellClass} pl-0.5 pr-1 align-middle`}>
        <div
          className="docs-row flex items-center gap-2.5 min-w-0"
          style={{ minHeight: 20 }}
        >
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
            onClick={(e) => {
              // Мобила: тап по названию открывает меню «⋮» (там выбор действия),
              // а не правит слот. Десктоп — даём всплыть к onClick строки (edit).
              if (isMobileViewport()) {
                e.stopPropagation()
                setMenuOpen(true)
              }
            }}
          >
            {document.name}
          </span>
          {/* Текстовая кнопка статуса. Скрывается через CSS container query
              (см. .docs-status-label в globals.css), когда строка документа
              становится слишком узкой и место нужно отдать названию. */}
          <span className="docs-status-label shrink-0 inline-flex">
            <DocumentStatusLabelDropdown
              documentId={document.id}
              currentStatus={currentStatus}
              statuses={statuses}
              statusBgColor={statusBgColor}
              onStatusChange={onStatusChange}
            />
          </span>
          {/* Комментарии, открыть, меню */}
          {!compressingDocIds.has(document.id) && projectId && workspaceId && (
            <CommentBadge
              entityType="document"
              entityId={document.id}
              projectId={projectId}
              workspaceId={workspaceId}
              emptyClassName="hidden md:inline-flex md:opacity-0 md:group-hover/doc:opacity-100"
            />
          )}
          <div
            className={`shrink-0 flex items-center gap-0.5 transition-opacity duration-150 ${compressingDocIds.has(document.id) ? 'md:hidden' : menuOpen ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover/doc:opacity-100'}`}
          >
            {hasFile && currentFile && (
              <button
                type="button"
                // На мобиле открытие — через меню «⋮» (тап по названию), эту
                // иконку прячем, чтобы не занимала место. Десктоп — как было.
                className="h-5 w-5 p-0 hidden md:flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
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
                open={menuOpen}
                onOpenChange={setMenuOpen}
                slotId={slotId}
              />
            )}
          </div>
        </div>
      </td>
      {/* Размер (+ быстрое сжатие несжатого PDF при наведении).
          Во время сжатия — анимация вместо размера, в том же месте. */}
      <td className="group/size py-0.5 pl-2 pr-1 text-right align-middle whitespace-nowrap w-[80px]">
        {compressingDocIds.has(document.id) ? (
          <div className="flex items-center justify-end min-h-[20px] border-l border-gray-100 pl-2">
            <span className="w-10 h-1 bg-orange-100 rounded-full overflow-hidden relative inline-block">
              <span className="absolute h-full w-1/2 bg-orange-500 rounded-full animate-[compress_1.5s_ease-in-out_infinite]" />
            </span>
          </div>
        ) : (
          hasFile && currentFile && (
          <div
            className={`flex items-center justify-end gap-0.5 min-h-[20px] border-l border-gray-100 pl-2 text-[12px] tabular-nums ${sizeColorClass}`}
          >
            {/* Слот слева от размера: зелёная «сжат» ИЛИ кнопка сжатия (по hover).
                Одинаков у всех строк — не двигает размер. */}
            <span className="w-4 shrink-0 inline-flex items-center justify-center">
              {currentFile.is_compressed ? (
                <span title="Документ сжат" className="inline-flex">
                  <Minimize2 className="h-3 w-3 text-green-600" />
                </span>
              ) : (currentFile.mime_type || '').includes('pdf') &&
                !compressingDocIds.has(document.id) ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCompressDocument(document.id)
                  }}
                  title="Сжать PDF"
                  className="p-0.5 -my-0.5 rounded text-muted-foreground/50 hover:text-blue-600 hover:bg-muted opacity-0 group-hover/size:opacity-100 transition-opacity"
                >
                  <Minimize2 className="h-3 w-3" />
                </button>
              ) : null}
            </span>
            {formatSize(currentFile.file_size || 0)}
          </div>
          )
        )}
      </td>
      {/* Дата загрузки */}
      <td className="py-0.5 pl-1 pr-1 md:pr-2.5 text-right align-middle whitespace-nowrap w-[80px]">
        <div className="flex items-center justify-end min-h-[20px] border-l border-gray-100 pl-1.5 text-[12px] tabular-nums text-gray-400">
          {formatSmartDate(currentFile?.created_at ?? null)}
        </div>
      </td>
    </tr>
  )
})
