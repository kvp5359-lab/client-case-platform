"use client"

/**
 * Карточка папки в карточном представлении
 */

import { memo, useMemo, useState } from 'react'
import { HelpCircle, Upload, ChevronDown, Check, Folder as FolderIcon, Plus } from 'lucide-react'
import { CommentBadge } from '@/components/comments'
import { cn } from '@/lib/utils'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { safeCssColor } from '@/utils/isValidCssColor'
import { formatSize } from '@/utils/formatSize'
import { DocumentItem } from './DocumentItem'
import { SlotItem } from './SlotItem'
import { useCardViewContext } from './CardViewContext'
import type {
  Folder,
  DocumentWithFiles,
  DocumentStatus,
  FolderSlotWithDocument,
} from '@/components/documents/types'

const noop = () => {}

const addButtonClassName =
  'flex items-center justify-center gap-1 py-1 px-3 text-xs text-muted-foreground/70 border border-dashed border-muted-foreground/30 rounded-lg hover:text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted/30 transition-colors opacity-100 md:opacity-0 md:group-hover/card:opacity-100 transition-opacity'

function isNeutralColor(color: string): boolean {
  if (!color.startsWith('#')) return false
  const hex = color.slice(1).toLowerCase()
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) return false
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return Math.max(r, g, b) - Math.min(r, g, b) < 25
}

export interface FolderCardProps {
  folder: Folder
  documents: DocumentWithFiles[]
  folderStatuses: DocumentStatus[]
  isCollapsed: boolean
  onToggleCollapse: (folderId: string) => void
  onFolderStatusChange: (folderId: string, status: string | null) => void
  onAddDocument: (folderId: string) => void
  slots?: FolderSlotWithDocument[]
  onSlotClick?: (slotId: string, folderId: string) => void
  onAddSlot?: (folderId: string) => void
  onSlotDrop?: (slotId: string, documentId: string) => void
  onSlotDelete?: (slotId: string) => void
  onSlotRename?: (slotId: string, name: string) => void
  newSlotId?: string | null
  onNewSlotCreated?: () => void
}

export const FolderCard = memo(function FolderCard({
  folder,
  documents,
  folderStatuses,
  isCollapsed,
  onToggleCollapse,
  onFolderStatusChange,
  onAddDocument,
  slots = [],
  onSlotClick,
  onAddSlot,
  onSlotDrop,
  onSlotDelete,
  onSlotRename,
  newSlotId,
  onNewSlotCreated,
}: FolderCardProps) {
  const { projectId, workspaceId } = useCardViewContext()
  const [isDescriptionDialogOpen, setIsDescriptionDialogOpen] = useState(false)

  // Мемоизированная сортировка слотов (заполненные сверху, пустые снизу)
  const sortedSlots = useMemo(
    () =>
      [...slots].sort((a, b) => {
        if (a.document_id && !b.document_id) return -1
        if (!a.document_id && b.document_id) return 1
        return (a.sort_order || 0) - (b.sort_order || 0)
      }),
    [slots],
  )

  const totalSize = useMemo(() => {
    let size = 0
    for (const doc of documents) {
      for (const f of doc.document_files || []) size += f.file_size || 0
    }
    for (const slot of slots) {
      if (slot.document) {
        for (const f of slot.document.document_files || []) size += f.file_size || 0
      }
    }
    return size
  }, [documents, slots])

  const currentFolderStatus = folderStatuses.find((s) => s.id === folder.status) || null

  // Z5-31: валидация CSS-цвета через safeCssColor
  const rawColor = currentFolderStatus?.color || null
  const folderColor = rawColor ? safeCssColor(rawColor) : null

  const useGradient = folderColor && !isNeutralColor(folderColor)

  return (
    <>
      <Card
        className={cn(
          'group/card rounded-[2.5rem] transition-all duration-200 flex flex-col',
          isCollapsed ? 'shadow-none' : 'shadow-[0_0_50px_rgba(0,0,0,0.1)]',
          isCollapsed
            ? 'border border-muted-foreground/30 bg-white hover:bg-gray-100 hover:ring-4 hover:ring-inset hover:ring-white'
            : 'border-none bg-white',
        )}
      >
        {/* Заголовок папки — при раскрытии фиксированная ширина слева */}
        <CardHeader
          role="button"
          tabIndex={0}
          className="group/header py-3 px-6 space-y-0 cursor-pointer select-none hover:bg-muted/30 transition-colors rounded-[2.5rem]"
          onClick={() => onToggleCollapse(folder.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onToggleCollapse(folder.id)
            }
          }}
        >
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold tracking-tight flex items-center gap-2 min-w-0">
              <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div
                      role="button"
                      tabIndex={0}
                      className="flex-shrink-0 cursor-pointer hover:scale-110 transition-transform"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                        }
                      }}
                      title={`Статус: ${currentFolderStatus?.name || 'Не выбран'}`}
                    >
                      {currentFolderStatus?.is_final && currentFolderStatus?.color ? (
                        <div className="relative">
                          <FolderIcon
                            className="h-5 w-5"
                            style={{
                              color: safeCssColor(currentFolderStatus.color),
                              fill: safeCssColor(currentFolderStatus.color),
                              stroke: safeCssColor(currentFolderStatus.color),
                            }}
                          />
                          <Check
                            className="absolute inset-0 m-auto h-2.5 w-2.5 text-white"
                            strokeWidth={3}
                          />
                        </div>
                      ) : (
                        <FolderIcon
                          className="h-5 w-5"
                          style={
                            currentFolderStatus?.color
                              ? {
                                  color: safeCssColor(currentFolderStatus.color),
                                  stroke: safeCssColor(currentFolderStatus.color),
                                  strokeWidth: 3,
                                }
                              : {
                                  color: '#9ca3af',
                                  stroke: '#9ca3af',
                                  strokeWidth: 3,
                                }
                          }
                        />
                      )}
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        onFolderStatusChange(folder.id, null)
                      }}
                      className="flex items-center gap-2"
                    >
                      <FolderIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                      <span className="text-gray-500">Не выбран</span>
                    </DropdownMenuItem>
                    {folderStatuses.map((status) => (
                      <DropdownMenuItem
                        key={status.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          onFolderStatusChange(folder.id, status.id)
                        }}
                        className="flex items-center gap-2"
                      >
                        <FolderIcon
                          className="h-3 w-3 flex-shrink-0"
                          style={
                            status.is_final
                              ? {
                                  color: safeCssColor(status.color),
                                  fill: safeCssColor(status.color),
                                  stroke: safeCssColor(status.color),
                                }
                              : {
                                  color: safeCssColor(status.color),
                                  stroke: safeCssColor(status.color),
                                }
                          }
                        />
                        <span>{status.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <span className="truncate" style={folderColor ? { color: folderColor } : undefined}>
                {folder.name}
              </span>
              {folder.description && (
                <button
                  className="p-0 flex-shrink-0 hover:bg-transparent"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsDescriptionDialogOpen(true)
                  }}
                  title="Показать описание"
                >
                  <HelpCircle className="h-4 w-4 text-muted-foreground/50 hover:text-muted-foreground transition-colors" />
                </button>
              )}
              {!isCollapsed && projectId && workspaceId && (
                <div onClick={(e) => e.stopPropagation()}>
                  <CommentBadge
                    entityType="document_folder"
                    entityId={folder.id}
                    projectId={projectId}
                    workspaceId={workspaceId}
                    emptyClassName="opacity-0 group-hover/header:opacity-100"
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              {isCollapsed && (documents.length > 0 || slots.length > 0) && (
                <div className="relative flex items-center">
                  <span className="text-xs text-muted-foreground transition-opacity group-hover/card:opacity-0">
                    {slots.length > 0
                      ? `${slots.filter((s) => s.document_id).length}/${slots.length}${documents.length > 0 ? ` +${documents.length}` : ''}`
                      : documents.length}
                  </span>
                  {projectId && workspaceId && (
                    <div
                      className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <CommentBadge
                        entityType="document_folder"
                        entityId={folder.id}
                        projectId={projectId}
                        workspaceId={workspaceId}
                      />
                    </div>
                  )}
                </div>
              )}
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  isCollapsed ? '-rotate-90' : 'rotate-90',
                )}
              />
            </div>
          </div>
        </CardHeader>

        {/* Контент — только при раскрытой карточке */}
        {!isCollapsed && (
          <>
            <CardContent className="pt-1 group/content">
              {documents.length > 0 || slots.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {documents.map((doc) => (
                    <DocumentItem key={doc.id} document={doc} />
                  ))}
                  {sortedSlots.map((slot) => (
                    <SlotItem
                      key={slot.id === newSlotId ? `${slot.id}-new` : slot.id}
                      slot={slot}
                      onSlotClick={onSlotClick ?? noop}
                      onSlotDrop={onSlotDrop}
                      onSlotDelete={onSlotDelete}
                      onSlotRename={onSlotRename}
                      isNew={slot.id === newSlotId}
                      onNewSlotCreated={onNewSlotCreated}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-4">Нет документов</div>
              )}
              <div className="flex items-center gap-2 mt-2.5">
                {onAddSlot && (
                  <button
                    className={addButtonClassName}
                    onClick={(e) => {
                      e.stopPropagation()
                      onAddSlot(folder.id)
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    Добавить слот
                  </button>
                )}
                <button
                  className="flex items-center justify-center gap-1 py-1 px-3 text-xs text-blue-600/80 border border-dashed border-blue-400/50 rounded-lg hover:text-blue-700 hover:border-blue-500/70 hover:bg-blue-50 transition-colors opacity-100 md:opacity-0 md:group-hover/card:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAddDocument(folder.id)
                  }}
                >
                  <Upload className="h-3 w-3" />
                  Документы
                </button>
                {totalSize > 0 && (
                  <span className="ml-auto text-xs text-muted-foreground/50">
                    {formatSize(totalSize)}
                  </span>
                )}
              </div>
            </CardContent>
          </>
        )}
      </Card>

      {/* Диалог с описанием папки */}
      <Dialog open={isDescriptionDialogOpen} onOpenChange={setIsDescriptionDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Описание папки: {folder.name}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm whitespace-pre-wrap">
              {folder.description || 'Описание отсутствует'}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
})
