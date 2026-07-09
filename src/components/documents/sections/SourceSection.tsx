"use client"

/**
 * Секция документов из источника (Google Drive)
 * Группирует документы по папкам (parentFolderName)
 */

import { memo, useMemo } from 'react'
import { Folder, EyeOff, Cloud, Trash2, RefreshCw } from 'lucide-react'
import { CollapsedSection } from './CollapsedSection'
import { SourceDocumentRow } from '../SourceDocumentRow'
import { SystemSectionTable } from '../SystemSectionTable'
import type { SourceDocument } from '../types'

const NO_SOURCE_KEY = '__none__'

type SourceSectionProps = {
  documents: SourceDocument[]
  /** Имена источников по id (для заголовков групп). */
  sourceNameById: Map<string, string>
  /** Удаляемые источники (отдельные, добавленные вручную) — id → true. */
  removableSourceIds?: Set<string>
  /** id источника, который сейчас синхронизируется. */
  syncingSourceId?: string | null
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
  onDeleteSource?: (sourceId: string) => void
  onSyncSource?: (sourceId: string) => void
}

export const SourceSection = memo(function SourceSection({
  documents,
  sourceNameById,
  removableSourceIds,
  syncingSourceId,
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
  onDeleteSource,
  onSyncSource,
}: SourceSectionProps) {
  // Двухуровневая группировка: источник → папка → файлы.
  const sourceGroups = useMemo(() => {
    const bySource = new Map<string, Map<string, SourceDocument[]>>()
    for (const doc of documents) {
      const sourceKey = doc.sourceId || NO_SOURCE_KEY
      const folder = doc.parentFolderName || 'Без папки'
      let folders = bySource.get(sourceKey)
      if (!folders) {
        folders = new Map()
        bySource.set(sourceKey, folders)
      }
      const list = folders.get(folder)
      if (list) list.push(doc)
      else folders.set(folder, [doc])
    }
    return Array.from(bySource.entries())
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
        {sourceGroups.map(([sourceKey, folders]) => {
          const sourceName =
            sourceKey === NO_SOURCE_KEY
              ? 'Без источника'
              : sourceNameById.get(sourceKey) || 'Источник'
          const totalFiles = Array.from(folders.values()).reduce((s, f) => s + f.length, 0)
          const removable = sourceKey !== NO_SOURCE_KEY && !!removableSourceIds?.has(sourceKey)
          return (
            <div key={sourceKey} className="border-b border-gray-200">
              {/* Заголовок источника */}
              <div className="group/source flex items-center gap-1.5 px-3 py-2 bg-gray-50">
                <Cloud className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                <span className="text-sm font-semibold text-gray-700 truncate">{sourceName}</span>
                <span className="text-[11px] text-gray-400">{totalFiles}</span>
                {sourceKey !== NO_SOURCE_KEY && onSyncSource && (
                  <button
                    type="button"
                    onClick={() => onSyncSource(sourceKey)}
                    disabled={syncingSourceId === sourceKey}
                    className="ml-auto shrink-0 p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent transition-all md:opacity-0 md:group-hover/source:opacity-100 disabled:opacity-100"
                    title="Синхронизировать источник"
                  >
                    <RefreshCw
                      className={
                        'h-3 w-3 ' + (syncingSourceId === sourceKey ? 'animate-spin' : '')
                      }
                    />
                  </button>
                )}
                {removable && onDeleteSource && (
                  <button
                    type="button"
                    onClick={() => onDeleteSource(sourceKey)}
                    className={
                      'shrink-0 p-0.5 rounded text-muted-foreground/40 hover:text-destructive hover:bg-accent transition-all md:opacity-0 md:group-hover/source:opacity-100' +
                      (sourceKey !== NO_SOURCE_KEY && onSyncSource ? '' : ' ml-auto')
                    }
                    title="Удалить источник"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              {/* Папки внутри источника */}
              {Array.from(folders.entries()).map(([folderName, files]) => (
                <div key={folderName}>
                  <div className="group/folder flex items-center gap-1.5 px-3 py-1.5 pl-6 border-b border-gray-100">
                    <Folder className="h-3.5 w-3.5 text-purple-400" />
                    <span className="text-xs font-medium text-purple-600 truncate">
                      {folderName}
                    </span>
                    <span className="text-[10px] text-purple-400">{files.length}</span>
                    <button
                      type="button"
                      onClick={() => onToggleFolderHidden(folderName, true)}
                      className="ml-auto flex-shrink-0 p-0.5 rounded hover:bg-accent text-muted-foreground/40 hover:text-muted-foreground transition-all md:opacity-0 md:group-hover/folder:opacity-100"
                      title="Скрыть всю папку"
                    >
                      <EyeOff className="h-3 w-3" />
                    </button>
                  </div>
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
          )
        })}
      </div>
    </CollapsedSection>
  )
})
