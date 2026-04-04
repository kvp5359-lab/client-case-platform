"use client"

/**
 * Секция корзины
 */

import { memo } from 'react'
import { CollapsedSection } from './CollapsedSection'
import { TrashedDocumentRow } from '../TrashedDocumentRow'
import { SystemSectionTable } from '../SystemSectionTable'
import type { DocumentWithFiles } from '../types'

interface TrashSectionProps {
  documents: DocumentWithFiles[]
  isCollapsed: boolean
  selectedDocuments: Set<string>
  hasSelection: boolean
  hoveredDocumentId: string | null

  // Обработчики
  onSelectDocument: (docId: string, event?: React.MouseEvent) => void
  onHoverDocument: (docId: string | null) => void
  onOpenEditDocument: (docId: string) => void
  onRestoreDocument: (docId: string) => void
  onHardDeleteDocument: (docId: string) => void
}

export const TrashSection = memo(function TrashSection({
  documents,
  isCollapsed,
  selectedDocuments,
  hasSelection,
  hoveredDocumentId,
  onSelectDocument,
  onHoverDocument,
  onOpenEditDocument,
  onRestoreDocument,
  onHardDeleteDocument,
}: TrashSectionProps) {
  if (documents.length === 0) {
    return (
      <CollapsedSection isCollapsed={isCollapsed}>
        <div className="text-center text-muted-foreground text-sm py-4">Корзина пуста</div>
      </CollapsedSection>
    )
  }

  return (
    <CollapsedSection isCollapsed={isCollapsed}>
      <SystemSectionTable>
        {documents.map((doc, idx) => (
          <TrashedDocumentRow
            key={doc.id}
            document={doc}
            index={idx}
            isSelected={selectedDocuments.has(doc.id)}
            hasSelection={hasSelection}
            isHovered={hoveredDocumentId === doc.id}
            onSelect={onSelectDocument}
            onHover={onHoverDocument}
            onOpenEdit={onOpenEditDocument}
            onRestore={onRestoreDocument}
            onDelete={onHardDeleteDocument}
          />
        ))}
      </SystemSectionTable>
    </CollapsedSection>
  )
})
