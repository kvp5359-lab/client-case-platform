"use client"

/**
 * Карточка папки в карточном представлении
 */

import { memo, useMemo, useState, Fragment } from 'react'
import { cn } from '@/lib/utils'
import { DocumentItem } from './DocumentItem'
import { SlotItem } from './SlotItem'
import { FolderCardHeader } from './FolderCardHeader'
import { UploadProgressRow } from './UploadProgressRow'
import { useDocumentsContext } from './DocumentsContext'
import { useFolderCardDragDrop } from './hooks/useFolderCardDragDrop'
import type {
  Folder,
  DocumentWithFiles,
  DocumentStatus,
  FolderSlotWithDocument,
} from '@/components/documents/types'

const noop = () => {}

export interface FolderCardProps {
  folder: Folder
  documents: DocumentWithFiles[]
  folderStatuses: DocumentStatus[]
  onFolderStatusChange: (folderId: string, status: string | null) => void
  onAddDocument?: (folderId: string) => void
  slots?: FolderSlotWithDocument[]
  onSlotClick?: (slotId: string, folderId: string) => void
  onAddSlot?: (folderId: string) => void
  onSlotDrop?: (slotId: string, documentId: string) => void
  onSlotDelete?: (slotId: string) => void
  onSlotRename?: (slotId: string, name: string) => void
  newSlotId?: string | null
  onNewSlotCreated?: () => void
  filterMode?: 'all' | 'action-required'
  onEditFolder?: (folderId: string) => void
  onDeleteFolder?: (folderId: string) => void
}

export const FolderCard = memo(function FolderCard({
  folder,
  documents,
  folderStatuses: _folderStatuses,
  onFolderStatusChange: _onFolderStatusChange,
  onAddDocument,
  slots = [],
  onSlotClick,
  onAddSlot,
  onSlotDrop,
  onSlotDelete,
  onSlotRename,
  newSlotId,
  onNewSlotCreated,
  filterMode = 'all',
  onEditFolder,
  onDeleteFolder,
}: FolderCardProps) {
  const {
    projectId,
    workspaceId,
    statuses,
    sourceUploadFolderId,
    sourceUploadPhase,
    sourceUploadTargetDocId,
    sourceUploadTargetPosition,
  } = useDocumentsContext()

  const {
    isSourceDragOver,
    isDocDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    draggedDocId,
  } = useFolderCardDragDrop(folder.id)

  const isUploading = sourceUploadFolderId === folder.id

  // Снимок ID скрытых документов — фиксируется ПРИ переключении filterMode.
  // Реализовано через tracked previous filterMode (derived-update), а не через
  // useEffect+setState, чтобы не нарушать set-state-in-effect. На момент снимка
  // используем актуальные documents/slots/statuses — они как раз те, что видит
  // пользователь в момент клика по фильтру.
  const [hiddenDocIds, setHiddenDocIds] = useState<Set<string>>(new Set())
  const [hiddenSlotIds, setHiddenSlotIds] = useState<Set<string>>(new Set())
  const [prevFilterMode, setPrevFilterMode] = useState(filterMode)
  if (filterMode !== prevFilterMode) {
    setPrevFilterMode(filterMode)
    if (filterMode === 'action-required') {
      setHiddenDocIds(
        new Set(
          documents
            .filter((doc) => {
              const status = statuses.find((s) => s.id === doc.status)
              return !!status?.is_final
            })
            .map((doc) => doc.id),
        ),
      )
      setHiddenSlotIds(
        new Set(
          slots
            .filter((slot) => {
              if (!slot.document_id || !slot.document) return false
              const status = statuses.find((s) => s.id === slot.document!.status)
              return !!status?.is_final
            })
            .map((slot) => slot.id),
        ),
      )
    } else {
      setHiddenDocIds(new Set())
      setHiddenSlotIds(new Set())
    }
  }

  // Фильтрация документов по зафиксированному снимку
  const filteredDocuments = useMemo(() => {
    if (filterMode === 'all') return documents
    return documents.filter((doc) => !hiddenDocIds.has(doc.id))
  }, [documents, filterMode, hiddenDocIds])

  // Фильтрация слотов по зафиксированному снимку
  const filteredSlots = useMemo(() => {
    if (filterMode === 'all') return slots
    return slots.filter((slot) => !hiddenSlotIds.has(slot.id))
  }, [slots, filterMode, hiddenSlotIds])

  // Заполненные слоты — рендерятся в таблице вместе с документами
  const filledSlots = useMemo(
    () =>
      filteredSlots
        .filter((s) => !!s.document_id && !!s.document)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [filteredSlots],
  )

  // Пустые слоты — рендерятся в flex-wrap отдельно
  const emptySlots = useMemo(
    () =>
      filteredSlots
        .filter((s) => !s.document_id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [filteredSlots],
  )

  // Единый список: обычные документы + документы из слотов, отсортированные по sort_order документа
  const allDocumentRows = useMemo(() => {
    const rows: Array<{ doc: DocumentWithFiles; slotId?: string }> = []
    for (const doc of filteredDocuments) {
      rows.push({ doc })
    }
    for (const slot of filledSlots) {
      rows.push({ doc: slot.document!, slotId: slot.id })
    }
    rows.sort((a, b) => (a.doc.sort_order || 0) - (b.doc.sort_order || 0))
    return rows
  }, [filteredDocuments, filledSlots])

  return (
    <div
      className={cn(
        'group/card flex flex-col',
        isSourceDragOver && 'ring-2 ring-purple-400 ring-inset rounded-lg bg-purple-50/30',
        isDocDragOver &&
          !isSourceDragOver &&
          'ring-2 ring-blue-400 ring-inset rounded-lg bg-blue-50/30',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <FolderCardHeader
        folder={folder}
        projectId={projectId}
        workspaceId={workspaceId}
        isUploading={isUploading}
        sourceUploadTargetDocId={sourceUploadTargetDocId}
        sourceUploadPhase={sourceUploadPhase}
        onEditFolder={onEditFolder}
        onDeleteFolder={onDeleteFolder}
        onAddSlot={onAddSlot}
        onAddDocument={onAddDocument}
      />

      {/* Контент папки */}
      <div className="-mt-1 pr-2 pb-2 group/content">
        {filteredDocuments.length > 0 || filledSlots.length > 0 || emptySlots.length > 0 ? (
          <>
            {allDocumentRows.length > 0 && (
              <table className="w-full border-collapse">
                <tbody>
                  {allDocumentRows.map(({ doc, slotId }) => {
                    const showBefore =
                      isUploading &&
                      sourceUploadTargetDocId === doc.id &&
                      sourceUploadTargetPosition === 'top'
                    const showAfter =
                      isUploading &&
                      sourceUploadTargetDocId === doc.id &&
                      sourceUploadTargetPosition === 'bottom'
                    return (
                      <Fragment key={doc.id}>
                        {showBefore && <UploadProgressRow phase={sourceUploadPhase} />}
                        <DocumentItem document={doc} slotId={slotId} />
                        {showAfter && <UploadProgressRow phase={sourceUploadPhase} />}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
            {emptySlots.length > 0 && (
              <div className="flex flex-col items-start gap-1 mt-1 ml-1">
                {emptySlots.map((slot) => (
                  <SlotItem
                    key={slot.id}
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
            )}
          </>
        ) : (
          <div
            className={cn(
              'text-sm text-center py-4',
              isDocDragOver ? 'text-blue-600 font-medium' : 'text-muted-foreground',
            )}
          >
            {draggedDocId ? '↓ Перетащите документ сюда' : 'Нет документов'}
          </div>
        )}
      </div>
    </div>
  )
})
