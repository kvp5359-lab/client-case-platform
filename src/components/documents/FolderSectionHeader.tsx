"use client"

/**
 * Заголовок секции папки — статус, название, кнопки действий
 */

import { memo } from 'react'
import { safeCssColor } from '@/utils/isValidCssColor'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, ChevronRight, Upload, MoreVertical, Folder, Plus, Trash2 } from 'lucide-react'
import { TableColgroup } from './TableColgroup'
import type { DocumentStatus, Folder as FolderType } from './types'
import { CommentBadge } from '@/components/comments'

interface FolderSectionHeaderProps {
  folder: FolderType
  folderIndex?: number
  documentsCount: number
  slotsCount: number
  filledSlotsCount: number
  emptySlotsCount: number
  folderStatuses: DocumentStatus[]
  currentFolderStatus: DocumentStatus | null
  isCollapsed: boolean
  isHovered: boolean
  isDragOver: boolean
  linkedArticleTitle?: string
  projectId?: string
  workspaceId?: string
  descriptionButton: React.ReactNode
  handlers: {
    onHoverFolder: (id: string | null) => void
    onFolderDragOver: (e: React.DragEvent, folderId: string) => void
    onFolderDragLeave: () => void
    onFolderDrop: (e: React.DragEvent, folderId: string) => void
    onFolderStatusChange: (folderId: string, statusId: string | null) => void
    onAddDocumentToFolder: (folderId: string) => void
    onEditFolder: (folder: FolderType) => void
    onAddSlot: (folderId: string) => void
    onDeleteEmptySlots: (folderId: string) => void
    onDeleteFolder: (folderId: string) => void
  }
}

export const FolderSectionHeader = memo(function FolderSectionHeader({
  folder,
  folderIndex,
  documentsCount,
  slotsCount,
  filledSlotsCount,
  emptySlotsCount,
  folderStatuses,
  currentFolderStatus,
  isCollapsed,
  isHovered,
  isDragOver,
  projectId,
  workspaceId,
  descriptionButton,
  linkedArticleTitle,
  handlers,
}: FolderSectionHeaderProps) {
  return (
    <div
      className={`hover:brightness-95 transition-all overflow-hidden rounded-t-xl ${isCollapsed ? 'rounded-b-xl' : ''} ${isDragOver ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
      style={{
        backgroundColor: currentFolderStatus?.color
          ? `${safeCssColor(currentFolderStatus.color)}20`
          : '#e5e7eb',
      }}
      onMouseEnter={() => handlers.onHoverFolder(folder.id)}
      onMouseLeave={() => handlers.onHoverFolder(null)}
      onDragOver={(e) => {
        e.preventDefault()
        handlers.onFolderDragOver(e, folder.id)
      }}
      onDragLeave={() => handlers.onFolderDragLeave()}
      onDrop={(e) => {
        handlers.onFolderDrop(e, folder.id)
      }}
    >
      <table className="w-full table-fixed border-collapse">
        <TableColgroup />
        <tbody>
          <tr>
            <td className="py-0 px-4" colSpan={3}>
              <div className="flex items-center gap-2 w-full">
                <CollapsibleTrigger className="flex items-center gap-1 flex-shrink-0 -ml-1">
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 flex-shrink-0" />
                  )}
                </CollapsibleTrigger>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div
                      role="button"
                      tabIndex={0}
                      className="flex-shrink-0 cursor-pointer hover:scale-110 transition-transform"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                        }
                      }}
                      title={`Статус: ${currentFolderStatus?.name || 'Не выбран'}`}
                    >
                      <Folder
                        className="h-4 w-4"
                        style={
                          currentFolderStatus?.color
                            ? {
                                color: safeCssColor(currentFolderStatus.color),
                                stroke: safeCssColor(currentFolderStatus.color),
                                strokeWidth: 3,
                              }
                            : { strokeWidth: 3 }
                        }
                      />
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        handlers.onFolderStatusChange(folder.id, null)
                      }}
                      className="flex items-center gap-2"
                    >
                      <Folder className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                      <span className="text-gray-500">Не выбран</span>
                    </DropdownMenuItem>
                    {folderStatuses.map((status) => (
                      <DropdownMenuItem
                        key={status.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          handlers.onFolderStatusChange(folder.id, status.id)
                        }}
                        className="flex items-center gap-2"
                      >
                        <Folder
                          className="h-3 w-3 flex-shrink-0"
                          style={{
                            color: safeCssColor(status.color),
                            stroke: safeCssColor(status.color),
                          }}
                        />
                        <span>{status.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <span className="font-semibold text-sm truncate min-w-0 text-left">
                  {folderIndex !== undefined && folderIndex !== null ? `${folderIndex + 1}. ` : ''}
                  {folder.name}
                </span>
                <span className="text-sm text-muted-foreground flex-shrink-0">
                  ({documentsCount})
                </span>
                {slotsCount > 0 && (
                  <span className="text-xs text-muted-foreground/70 flex-shrink-0">
                    • {filledSlotsCount}/{slotsCount} слотов
                  </span>
                )}
                {/* descriptionButton рендерится дважды: здесь (в первой колонке таблицы) он служит интерактивным контролом,
                    а во второй колонке (ниже) — как декоративный элемент рядом с текстом описания */}
                {descriptionButton}
                {projectId && workspaceId && (
                  <CommentBadge
                    entityType="document_folder"
                    entityId={folder.id}
                    projectId={projectId}
                    workspaceId={workspaceId}
                    emptyClassName={isHovered ? '' : 'opacity-0 pointer-events-none'}
                  />
                )}

                {/* Кнопки действий (появляются при наведении) */}
                <div
                  className={`flex items-center gap-2 ml-auto transition-opacity ${
                    isHovered ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      handlers.onAddDocumentToFolder(folder.id)
                    }}
                    className="h-7 text-xs"
                  >
                    <Upload className="h-3 w-3 mr-1" />
                    Документы
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => e.stopPropagation()}
                        className="h-7 w-7 p-0"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          handlers.onEditFolder(folder)
                        }}
                      >
                        Редактировать
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          handlers.onAddSlot(folder.id)
                        }}
                      >
                        <Plus className="h-3 w-3 mr-2" />
                        Добавить слот
                      </DropdownMenuItem>
                      {emptySlotsCount > 0 && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            handlers.onDeleteEmptySlots(folder.id)
                          }}
                        >
                          <Trash2 className="h-3 w-3 mr-2" />
                          Удалить пустые слоты
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          handlers.onDeleteFolder(folder.id)
                        }}
                      >
                        Удалить
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </td>
            <td className="py-0 px-4 text-xs text-muted-foreground truncate relative whitespace-nowrap overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-px bg-border"></div>
              <div className="flex items-center gap-2">
                {descriptionButton}
                <span className="truncate">{linkedArticleTitle || folder.description || ''}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
})
