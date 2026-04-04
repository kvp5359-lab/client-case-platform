"use client"

/**
 * Содержимое секции папки — документы (с виртуализацией) + слоты
 */

import { memo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { DocumentRow } from './DocumentRow'
import { EmptySlotsRow } from './SlotRow'
import { TableColgroup } from './TableColgroup'
import type { DocumentWithFiles, FolderSlotWithDocument } from './types'

const DOC_VIRTUALIZATION_THRESHOLD = 30
const ESTIMATED_DOC_ROW_HEIGHT = 28

interface FolderSectionContentProps {
  folderDocuments: DocumentWithFiles[]
  filledSlots: FolderSlotWithDocument[]
  allSlots: FolderSlotWithDocument[]
  slotByDocId: Map<string, string>
  isDragOver: boolean
  draggedDocId: string | null
  folderId: string
  handlers: {
    onFolderDragOver: (e: React.DragEvent, folderId: string) => void
    onFolderDragLeave: () => void
    onFolderDrop: (e: React.DragEvent, folderId: string) => void
  }
}

export const FolderSectionContent = memo(function FolderSectionContent({
  folderDocuments,
  filledSlots,
  allSlots,
  slotByDocId,
  isDragOver,
  draggedDocId,
  folderId,
  handlers,
}: FolderSectionContentProps) {
  const docContainerRef = useRef<HTMLDivElement>(null)
  const shouldVirtualizeDocs = folderDocuments.length > DOC_VIRTUALIZATION_THRESHOLD

  // eslint-disable-next-line react-hooks/incompatible-library
  const docVirtualizer = useVirtualizer({
    count: folderDocuments.length,
    getScrollElement: () => docContainerRef.current,
    estimateSize: () => ESTIMATED_DOC_ROW_HEIGHT,
    overscan: 10,
    enabled: shouldVirtualizeDocs,
  })

  const emptySlotsSorted = allSlots
    .filter((s) => !s.document_id)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

  if (folderDocuments.length === 0 && allSlots.length === 0) {
    return (
      <div
        className={`text-center text-muted-foreground text-sm py-1.5 transition-colors ${
          isDragOver ? 'bg-blue-100 border-2 border-blue-500 border-dashed' : 'bg-yellow-50'
        }`}
        onDragOver={(e) => handlers.onFolderDragOver(e, folderId)}
        onDragLeave={() => handlers.onFolderDragLeave()}
        onDrop={(e) => handlers.onFolderDrop(e, folderId)}
      >
        {draggedDocId ? '↓ Перетащите документ сюда' : 'Папка пуста'}
      </div>
    )
  }

  return (
    <div
      ref={shouldVirtualizeDocs ? docContainerRef : undefined}
      className={`transition-all ${
        isDragOver ? 'bg-blue-100 border-2 border-blue-500 border-dashed rounded' : ''
      }`}
      style={shouldVirtualizeDocs ? { maxHeight: '60vh', overflow: 'auto' } : undefined}
      onDragOver={(e) => {
        e.preventDefault()
        handlers.onFolderDragOver(e, folderId)
      }}
      onDragLeave={() => handlers.onFolderDragLeave()}
      onDrop={(e) => handlers.onFolderDrop(e, folderId)}
    >
      <table className="w-full table-fixed border-collapse">
        <TableColgroup />
        <tbody>
          {/* Документы: виртуализированный или обычный рендеринг */}
          {shouldVirtualizeDocs ? (
            <>
              {docVirtualizer.getVirtualItems().length > 0 &&
                docVirtualizer.getVirtualItems()[0]?.start > 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        height: docVirtualizer.getVirtualItems()[0].start,
                        padding: 0,
                        border: 'none',
                      }}
                    />
                  </tr>
                )}
              {docVirtualizer.getVirtualItems().map((virtualItem) => {
                const doc = folderDocuments[virtualItem.index]
                return (
                  <DocumentRow
                    key={doc.id}
                    document={doc}
                    index={virtualItem.index}
                    slotId={slotByDocId.get(doc.id)}
                  />
                )
              })}
              {(() => {
                const items = docVirtualizer.getVirtualItems()
                const lastItem = items[items.length - 1]
                const bottomPadding = lastItem ? docVirtualizer.getTotalSize() - lastItem.end : 0
                return bottomPadding > 0 ? (
                  <tr>
                    <td colSpan={4} style={{ height: bottomPadding, padding: 0, border: 'none' }} />
                  </tr>
                ) : null
              })()}
            </>
          ) : (
            folderDocuments.map((doc, idx) => (
              <DocumentRow
                key={doc.id}
                document={doc}
                index={idx}
                slotId={slotByDocId.get(doc.id)}
              />
            ))
          )}
          {/* Документы из заполненных слотов */}
          {filledSlots.map((slot, idx) => (
            <DocumentRow
              key={`slot-${slot.id}`}
              document={slot.document!}
              index={folderDocuments.length + idx}
              slotId={slot.id}
            />
          ))}
          {/* Пустые слоты — все в одну строку */}
          <EmptySlotsRow slots={emptySlotsSorted} />
        </tbody>
      </table>
    </div>
  )
})
