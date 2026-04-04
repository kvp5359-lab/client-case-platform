"use client"

/**
 * Меню действий с документом
 * Универсальный компонент для отображения контекстного меню документа
 */

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Unlink } from 'lucide-react'

/** Объект прав доступа для действий с документом */
export interface DocumentActionPermissions {
  canEdit?: boolean
  canView?: boolean
  canDownload?: boolean
  canCompress?: boolean
  canMove?: boolean
  canDuplicate?: boolean
  canDelete?: boolean
}

/** Объект callback-обработчиков действий с документом */
export interface DocumentActionHandlers {
  onOpenEdit: (docId: string) => void
  onOpenDocument: (docId: string) => void
  onDownload: (docId: string) => void
  onCompress: (docId: string) => void
  onMove: (docId: string) => void
  onDuplicate: (docId: string) => void
  onDelete: (docId: string) => void
  onSlotUnlink?: (slotId: string) => void
}

export interface DocumentActionsMenuProps {
  /** ID документа */
  docId: string
  /** Текущий файл документа (для проверки mime_type) */
  currentFile?: { mime_type: string } | null
  /** Callback-обработчики действий */
  handlers: DocumentActionHandlers
  /** Документ не привязан к карточке */
  isUnassigned?: boolean
  /** Множество ID документов, которые сейчас сжимаются */
  compressingDocIds: Set<string>
  /** Callback при изменении открытости меню */
  onOpenChange?: (open: boolean) => void
  /** Права доступа к действиям */
  permissions?: DocumentActionPermissions
  /** ID слота (если документ привязан к слоту) */
  slotId?: string
}

/**
 * Меню действий с документом с проверкой прав доступа
 */
export const DocumentActionsMenu = memo(function DocumentActionsMenu({
  docId,
  currentFile,
  handlers,
  isUnassigned = false,
  compressingDocIds,
  onOpenChange,
  permissions = {},
  slotId,
}: DocumentActionsMenuProps) {
  const {
    canEdit = true,
    canView = true,
    canDownload = true,
    canCompress = true,
    canMove = true,
    canDuplicate = true,
    canDelete = true,
  } = permissions

  const isPdf = currentFile?.mime_type === 'application/pdf'
  const isCompressing = compressingDocIds.has(docId)

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={(e) => e.stopPropagation()}
          aria-label="Действия с документом"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEdit && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              handlers.onOpenEdit(docId)
            }}
          >
            Редактировать
          </DropdownMenuItem>
        )}
        {canView && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              handlers.onOpenDocument(docId)
            }}
          >
            Открыть
          </DropdownMenuItem>
        )}
        {canDownload && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              handlers.onDownload(docId)
            }}
          >
            Скачать
          </DropdownMenuItem>
        )}
        {canCompress && isPdf && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              handlers.onCompress(docId)
            }}
            disabled={isCompressing}
          >
            {isCompressing ? 'Сжатие...' : 'Сжать PDF'}
          </DropdownMenuItem>
        )}
        {canMove && !isUnassigned && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              handlers.onMove(docId)
            }}
          >
            Переместить
          </DropdownMenuItem>
        )}
        {canDuplicate && !isUnassigned && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              handlers.onDuplicate(docId)
            }}
          >
            Дублировать
          </DropdownMenuItem>
        )}
        {slotId && handlers.onSlotUnlink && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                handlers.onSlotUnlink?.(slotId)
              }}
            >
              <Unlink className="h-3.5 w-3.5 mr-2" />
              Открепить от слота
            </DropdownMenuItem>
          </>
        )}
        {canDelete && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              handlers.onDelete(docId)
            }}
            className="text-destructive"
          >
            Удалить
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
