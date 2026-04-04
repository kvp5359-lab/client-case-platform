"use client"

/**
 * Элемент документа в карточном представлении
 */

import { memo, useCallback, useState } from 'react'
import { GripVertical, SquareArrowOutUpRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { StatusDropdown } from '@/components/ui/status-dropdown'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DocumentActionsMenu } from '@/components/documents/DocumentActionsMenu'
import { CommentBadge } from '@/components/comments'
import type {
  DocumentActionPermissions,
  DocumentActionHandlers,
} from '@/components/documents/DocumentActionsMenu'
import { formatSize } from '@/utils/formatSize'
import { useCardViewContext } from './CardViewContext'
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
    compressingDocId,
    onStatusChange,
    onOpenEdit,
    onOpenDocument,
    onDownloadDocument,
    onDeleteDocument,
    onCompressDocument,
    onMoveDocument,
    onCreateTask,
    onSlotUnlink,
  } = useCardViewContext()
  const currentFile =
    document.document_files?.find((f) => f.is_current) || document.document_files?.[0]
  const hasFile = (document.document_files?.length || 0) > 0
  const currentStatus = statuses.find((s) => s.id === document.status) || null
  const [menuOpen, setMenuOpen] = useState(false)

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('application/x-document-id', document.id)
    },
    [document.id],
  )

  const docPermissions: DocumentActionPermissions = {
    canView: !!onOpenDocument,
    canDownload: !!onDownloadDocument,
    canCompress: !!onCompressDocument,
    canMove: !!onMoveDocument,
    canDelete: !!onDeleteDocument,
    canCreateTask: !!onCreateTask,
  }

  const docHandlers: DocumentActionHandlers = {
    onOpenEdit: onOpenEdit,
    onOpenDocument: onOpenDocument || (() => {}),
    onDownload: onDownloadDocument || (() => {}),
    onCompress: onCompressDocument || (() => {}),
    onMove: onMoveDocument || (() => {}),
    onDelete: onDeleteDocument || (() => {}),
    onCreateTask: onCreateTask || (() => {}),
    onSlotUnlink: slotId ? onSlotUnlink : undefined,
  }

  return (
    <div className="relative group/doc">
      {/* Grip — абсолютно позиционирован слева, не сдвигает карточку */}
      <div
        className="absolute -left-5 top-0 bottom-0 w-5 flex items-center justify-center cursor-grab active:cursor-grabbing"
        draggable
        onDragStart={handleDragStart}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/0 group-hover/doc:text-muted-foreground/40 transition-colors" />
      </div>
      <div
        className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-gray-100 hover:bg-gray-200/70 transition-colors cursor-pointer"
        onClick={() => onOpenEdit(document.id)}
      >
        <StatusDropdown
          currentStatus={currentStatus}
          statuses={statuses}
          onStatusChange={(statusId) => onStatusChange(document.id, statusId)}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`flex-1 min-w-0 text-sm truncate ${!hasFile ? 'text-muted-foreground' : ''}`}
            >
              {document.name}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm">
            <p>{document.name}</p>
          </TooltipContent>
        </Tooltip>

        {/* Комментарии — видны всегда при наличии */}
        {projectId && workspaceId && (
          <CommentBadge
            entityType="document"
            entityId={document.id}
            projectId={projectId}
            workspaceId={workspaceId}
            emptyClassName="opacity-0 group-hover/doc:opacity-100"
          />
        )}

        {/* Размер файла / действия при hover */}
        {hasFile && currentFile ? (
          <div className="relative shrink-0 flex items-center">
            <span
              className={`text-xs text-muted-foreground whitespace-nowrap transition-opacity duration-150 ${menuOpen ? 'opacity-0' : 'group-hover/doc:opacity-0'}`}
            >
              {formatSize(currentFile.file_size || 0)}
            </span>
            <div
              className={`absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-0.5 transition-opacity duration-150 ${menuOpen ? 'opacity-100' : 'opacity-0 group-hover/doc:opacity-100'}`}
            >
              <button
                type="button"
                className="h-6 w-6 p-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenDocument(document.id)
                }}
                title="Открыть документ"
              >
                <SquareArrowOutUpRight className="h-3.5 w-3.5" />
              </button>
              <DocumentActionsMenu
                docId={document.id}
                currentFile={{ mime_type: currentFile.mime_type || '' }}
                handlers={docHandlers}
                permissions={docPermissions}
                compressingDocId={compressingDocId}
                onOpenChange={setMenuOpen}
                slotId={slotId}
              />
            </div>
          </div>
        ) : (
          <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">
            Нет файла
          </Badge>
        )}
      </div>
    </div>
  )
})
