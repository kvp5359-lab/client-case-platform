"use client"

/**
 * Секция документов из источника (Google Drive)
 * Группирует документы по папкам (parentFolderName)
 */

import { memo, useMemo } from 'react'
import { Folder, EyeOff } from 'lucide-react'
import { CollapsedSection } from './CollapsedSection'
import { SourceDocumentRow } from '../SourceDocumentRow'
import { SystemSectionTable } from '../SystemSectionTable'
import type { SourceDocument } from '../types'

interface SourceSectionProps {
  documents: SourceDocument[]
  isCollapsed: boolean
  isSyncing: boolean
  selectedDocuments: Set<string>
  hasSelection: boolean
  draggedSourceDoc: SourceDocument | null

  // Обработчики
  onSelectDocument: (docId: string, event?: React.MouseEvent) => void
  onToggleSourceDocHidden: (sourceDocId: string) => void
  onToggleFolderHidden: (folderName: string, hide: boolean) => void
  onDownloadSourceDocument: (file: SourceDocument) => void
  onMoveSourceDocument: (file: SourceDocument) => void
  onSourceDocDragStart: (e: React.DragEvent, file: SourceDocument) => void
  onSourceDocDragEnd: () => void
}

export const SourceSection = memo(function SourceSection({
  documents,
  isCollapsed,
  isSyncing,
  selectedDocuments,
  hasSelection,
  draggedSourceDoc,
  onSelectDocument,
  onToggleSourceDocHidden,
  onToggleFolderHidden,
  onDownloadSourceDocument,
  onMoveSourceDocument,
  onSourceDocDragStart,
  onSourceDocDragEnd,
}: SourceSectionProps) {
  // Группировка по папкам
  const groups = useMemo(() => {
    const map = new Map<string, SourceDocument[]>()
    for (const doc of documents) {
      const folder = doc.parentFolderName || 'Без папки'
      const list = map.get(folder)
      if (list) {
        list.push(doc)
      } else {
        map.set(folder, [doc])
      }
    }
    return Array.from(map.entries())
  }, [documents])

  const emptyMessage = isSyncing
    ? 'Синхронизация...'
    : 'Нет документов из источника. Нажмите кнопку синхронизации'

  if (documents.length === 0) {
    return (
      <CollapsedSection isCollapsed={isCollapsed}>
        <div className="text-center text-muted-foreground text-sm py-4">{emptyMessage}</div>
      </CollapsedSection>
    )
  }

  return (
    <CollapsedSection isCollapsed={isCollapsed}>
      <div>
        {groups.map(([folderName, files]) => (
          <div key={folderName}>
            {/* Заголовок группы-папки */}
            <div className="group/folder flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-100">
              <Folder className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-xs font-medium text-purple-600 truncate">{folderName}</span>
              <span className="text-[10px] text-purple-400">{files.length}</span>
              <button
                type="button"
                onClick={() => onToggleFolderHidden(folderName, true)}
                className="ml-auto flex-shrink-0 p-0.5 rounded hover:bg-accent text-muted-foreground/40 hover:text-muted-foreground transition-all opacity-0 group-hover/folder:opacity-100"
                title="Скрыть всю папку"
              >
                <EyeOff className="h-3 w-3" />
              </button>
            </div>
            {/* Документы этой папки */}
            <SystemSectionTable>
              {files.map((file) => (
                <SourceDocumentRow
                  key={file.id}
                  file={file}
                  isSelected={selectedDocuments.has(file.id)}
                  hasSelection={hasSelection}
                  isDragging={draggedSourceDoc?.id === file.id}
                  onSelect={onSelectDocument}
                  onToggleHidden={onToggleSourceDocHidden}
                  onDownload={onDownloadSourceDocument}
                  onMove={onMoveSourceDocument}
                  onDragStart={onSourceDocDragStart}
                  onDragEnd={onSourceDocDragEnd}
                />
              ))}
            </SystemSectionTable>
          </div>
        ))}
      </div>
    </CollapsedSection>
  )
})
