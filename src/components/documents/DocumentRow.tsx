"use client"

/**
 * Компонент строки документа в таблице
 *
 * Рефакторинг: использует DocumentKitContext вместо prop drilling
 * Принимает только document и index, всё остальное берёт из Context
 */

import { memo, useState } from 'react'
import { SquareArrowOutUpRight } from 'lucide-react'
import { CommentBadge } from '@/components/comments'
import { Checkbox } from '@/components/ui/checkbox'
import { StatusDropdown } from '@/components/ui/status-dropdown'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuthorName } from '@/hooks/shared/useAuthorName'
import { formatSize } from '@/utils/formatSize'
import { safeCssColor } from '@/utils/isValidCssColor'
import { getCurrentDocumentFile } from '@/utils/documentUtils'
import { formatShortDate } from '@/utils/dateFormat'
import type { DocumentWithFiles } from './types'
import { useProjectPermissions } from '@/hooks/permissions'
import { DocumentActionsMenu } from './DocumentActionsMenu'
import type { DocumentActionPermissions, DocumentActionHandlers } from './DocumentActionsMenu'
import {
  useDocumentKitData,
  useDocumentKitUIState,
  useDocumentKitHandlers,
  useDocumentKitIds,
} from '@/components/projects/DocumentKitsTab/context'

interface DocumentRowProps {
  document: DocumentWithFiles
  index: number
  isUnassigned?: boolean
  /** ID слота, если документ привязан к слоту */
  slotId?: string
}

export const DocumentRow = memo(function DocumentRow({
  document: doc,
  index,
  isUnassigned = false,
  slotId,
}: DocumentRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  // Берём данные из Context
  const { statuses } = useDocumentKitData()
  const {
    selectedDocuments,
    hasSelection,
    hoveredDocumentId,
    draggedDocId,
    dragOverDocId,
    dragOverPosition,
    compressingDocIds,
  } = useDocumentKitUIState()
  const handlers = useDocumentKitHandlers()
  const { projectId, workspaceId } = useDocumentKitIds()

  // Вычисляем состояние из Context
  const isSelected = selectedDocuments.has(doc.id)
  const isHovered = hoveredDocumentId === doc.id
  const isDragging = draggedDocId === doc.id
  const isOver = dragOverDocId === doc.id
  const currentStatus = statuses.find((s) => s.id === doc.status) || null

  // Проверка прав на управление документами
  const { can } = useProjectPermissions({ projectId: projectId || '' })
  const docPermissions: DocumentActionPermissions = {
    canEdit: can('documents', 'edit_documents'),
    canView: can('documents', 'view_documents'),
    canDownload: can('documents', 'download_documents'),
    canCompress: can('documents', 'compress_pdf'),
    canMove: can('documents', 'move_documents'),
    canDuplicate: !!handlers.onDuplicateDocument,
    canDelete: can('documents', 'delete_documents'),
  }

  const docHandlers: DocumentActionHandlers = {
    onOpenEdit: handlers.onOpenEditDocument,
    onOpenDocument: handlers.onOpenDocument,
    onDownload: handlers.onDownloadDocument,
    onCompress: handlers.onCompressDocument,
    onMove: handlers.onMoveDocument,
    onDuplicate: handlers.onDuplicateDocument || (() => {}),
    onDelete: handlers.onDeleteDocument,
    onSlotUnlink: handlers.onSlotUnlink,
  }

  // Получаем текущую версию файла
  const currentFile = getCurrentDocumentFile(doc.document_files)

  // Загружаем информацию об авторе загрузки
  const authorName = useAuthorName(currentFile?.uploaded_by ?? null)

  return (
    <tr
      className={`group border-t border-border h-7 transition-colors ${
        isDragging
          ? 'opacity-40 bg-blue-50'
          : isOver
            ? dragOverPosition === 'top'
              ? 'bg-blue-100 border-t-2 border-t-blue-500'
              : 'bg-blue-100 border-b-2 border-b-blue-500'
            : 'hover:bg-muted/30'
      }`}
      draggable
      onDragStart={(e) => handlers.onDocDragStart(e, doc.id)}
      onDragOver={(e) => handlers.onDocDragOver(e, doc.id)}
      onDragLeave={() => handlers.onDocDragLeave()}
      onDrop={(e) => handlers.onDocDrop(e, doc)}
      onDragEnd={() => handlers.onDocDragEnd()}
      onMouseEnter={() => handlers.onHoverDocument(doc.id)}
      onMouseLeave={() => handlers.onHoverDocument(null)}
    >
      {/* Колонка: Название + Статус */}
      <td className="py-0.5 px-3 relative">
        <div className="absolute right-0 top-2 bottom-2 w-px bg-border"></div>
        <div className="flex items-center justify-between gap-2 min-w-0 relative">
          <div className="flex items-center gap-2 min-w-0">
            {/* Чекбокс */}
            <Checkbox
              checked={isSelected}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation()
                handlers.onSelectDocument(doc.id, e)
              }}
              className={`transition-opacity flex-shrink-0 ${hasSelection ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            />

            {/* Пиктограмма статуса */}
            <StatusDropdown
              currentStatus={currentStatus}
              statuses={statuses}
              onStatusChange={(statusId) => handlers.onStatusChange(doc.id, statusId)}
              size="sm"
            />

            {/* Название документа */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handlers.onOpenEditDocument(doc.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handlers.onOpenEditDocument(doc.id)
                }
              }}
              className="text-sm truncate min-w-0 hover:text-primary hover:underline cursor-pointer transition-colors text-left"
              style={
                isUnassigned
                  ? { color: '#1d4ed8' }
                  : currentStatus?.text_color
                    ? { color: safeCssColor(currentStatus.text_color) }
                    : currentStatus?.color
                      ? { color: safeCssColor(currentStatus.color) }
                      : undefined
              }
            >
              {index + 1}. {doc.name}
            </div>
            {/* Комментарии — прижаты к названию */}
            <CommentBadge
              entityType="document"
              entityId={doc.id}
              projectId={projectId || ''}
              workspaceId={workspaceId || ''}
              emptyClassName={isHovered || menuOpen ? '' : 'opacity-0 pointer-events-none'}
            />
          </div>

          {/* Меню действий */}
          <div
            className={`flex-shrink-0 flex items-center gap-0.5 ${isHovered || menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            {currentFile && (
              <button
                className="h-6 w-6 p-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  handlers.onOpenDocument(doc.id)
                }}
                title="Открыть документ"
              >
                <SquareArrowOutUpRight className="h-3.5 w-3.5" />
              </button>
            )}
            <DocumentActionsMenu
              docId={doc.id}
              currentFile={currentFile}
              handlers={docHandlers}
              permissions={docPermissions}
              isUnassigned={isUnassigned}
              compressingDocIds={compressingDocIds}
              onOpenChange={setMenuOpen}
              slotId={slotId}
            />
          </div>
        </div>
      </td>

      {/* Колонка: Размер файла */}
      <td className="py-1 px-3 relative truncate text-xs text-gray-500 text-right">
        <div className="absolute left-0 top-2 bottom-2 w-px bg-border"></div>
        {currentFile ? formatSize(currentFile.file_size) : '—'}
      </td>

      {/* Колонка: Дата или прогресс сжатия */}
      <td className="py-1 px-3 relative truncate text-xs text-gray-500 text-right">
        <div className="absolute left-0 top-2 bottom-2 w-px bg-border"></div>
        {compressingDocIds.has(doc.id) ? (
          <div className="flex flex-col items-end gap-1 w-full">
            <span className="text-orange-600 font-medium">Сжатие...</span>
            <div className="w-full h-1 bg-orange-100 rounded-full overflow-hidden relative">
              <div className="absolute h-full w-1/2 bg-orange-500 rounded-full animate-[compress_1.5s_ease-in-out_infinite]" />
            </div>
          </div>
        ) : doc.created_at ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help hover:underline">{formatShortDate(doc.created_at)}</div>
            </TooltipTrigger>
            <TooltipContent className="text-xs bg-white text-gray-900 border border-gray-200">
              <div className="text-left">
                <div className="font-semibold">
                  Загружен: {new Date(doc.created_at).toLocaleString('ru-RU')}
                </div>
                {authorName && <div className="text-gray-600">Автор: {authorName}</div>}
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          '—'
        )}
      </td>

      {/* Колонка: Описание — скрыта в режиме нераспределённых */}
      {!isUnassigned && (
        <td className="py-1 px-3 relative text-xs text-gray-500">
          <div className="absolute left-0 top-2 bottom-2 w-px bg-border"></div>
          <div className="truncate overflow-hidden whitespace-nowrap">
            {doc.description || 'Нет комментария'}
          </div>
        </td>
      )}
    </tr>
  )
})
