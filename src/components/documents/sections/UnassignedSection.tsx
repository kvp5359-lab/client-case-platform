"use client"

/**
 * Секция нераспределённых документов
 */

import { memo } from 'react'
import { CollapsedSection } from './CollapsedSection'
import { DocumentRow } from '../DocumentRow'
import { SystemSectionTable } from '../SystemSectionTable'
import type { DocumentWithFiles } from '../types'

interface UnassignedSectionProps {
  documents: DocumentWithFiles[]
  isCollapsed: boolean
  draggedDocId: string | null
  dragOverFolderId: string | null
  draggedSourceDoc: { id: string } | null

  // Drag & drop
  onFolderDragOver: (e: React.DragEvent, folderId: string | null) => void
  onFolderDragLeave: () => void
  onFolderDrop: (e: React.DragEvent, folderId: string | null) => void
}

export const UnassignedSection = memo(function UnassignedSection({
  documents,
  isCollapsed,
  draggedDocId,
  dragOverFolderId,
  draggedSourceDoc,
  onFolderDragOver,
  onFolderDragLeave,
  onFolderDrop,
}: UnassignedSectionProps) {
  const isDragging = draggedDocId || draggedSourceDoc
  const emptyMessage = isDragging ? '↓ Перетащите документ сюда' : 'Нет нераспределённых документов'

  const isDragOver = isDragging && dragOverFolderId === 'unassigned'

  const dropZoneProps = {
    onDragOver: (e: React.DragEvent) => {
      if (isDragging) {
        e.preventDefault()
        onFolderDragOver(e, null)
      }
    },
    onDragLeave: () => {
      if (isDragging) onFolderDragLeave()
    },
    onDrop: (e: React.DragEvent) => {
      if (isDragging) onFolderDrop(e, null)
    },
  }

  if (documents.length === 0) {
    return (
      <CollapsedSection isCollapsed={isCollapsed}>
        <div
          className={`text-center text-muted-foreground text-sm py-4 ${isDragOver ? 'border-2 border-blue-500 border-dashed rounded' : ''}`}
          {...dropZoneProps}
        >
          {emptyMessage}
        </div>
      </CollapsedSection>
    )
  }

  return (
    <CollapsedSection isCollapsed={isCollapsed}>
      <div
        className={isDragOver ? 'border-2 border-blue-500 border-dashed rounded' : ''}
        {...dropZoneProps}
      >
        <SystemSectionTable>
          {documents.map((doc, idx) => (
            <DocumentRow key={doc.id} document={doc} index={idx} isUnassigned={true} />
          ))}
        </SystemSectionTable>
      </div>
    </CollapsedSection>
  )
})
