"use client"

/**
 * Содержимое вкладки «Нераспределённые» — три раздела:
 * Генерация, Загруженные, Из источника
 */

import { memo, useState } from 'react'
import {
  RefreshCw,
  Settings,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  FileDown,
  Plus,
} from 'lucide-react'
import { UnassignedSection, SourceSection } from '@/components/documents/sections'
import { useDocumentKitContext } from '../context'
import { useDocumentKitGoogleDrive } from '@/store/documentKitUI'
import { useDocumentGenerations } from '@/hooks/documents/useDocumentGenerations'
import { GenerationCard } from '@/page-components/ProjectPage/components/Documents/GenerationCard'
import { CreateGenerationDialog } from '@/components/documents/dialogs/CreateGenerationDialog'

export const UnassignedTabContent = memo(function UnassignedTabContent() {
  const { data, uiState, handlers, projectId, workspaceId } = useDocumentKitContext()
  const { sourceFolderName, isSourceConnected } = useDocumentKitGoogleDrive()
  const { data: generations = [] } = useDocumentGenerations(projectId)
  const [generationsCollapsed, setGenerationsCollapsed] = useState(false)
  const [createGenOpen, setCreateGenOpen] = useState(false)

  const { ungroupedDocuments, sourceDocuments, folders } = data
  const {
    unassignedCollapsed,
    sourceCollapsed,
    selectedDocuments,
    hasSelection,
    draggedDocId,
    dragOverFolderId,
    draggedSourceDoc,
    isSyncing,
    showHiddenSourceDocs,
  } = uiState

  return (
    <>
      {/* Раздел: Генерация документов */}
      <div>
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 bg-gray-100/80">
          <button
            type="button"
            onClick={() => setGenerationsCollapsed((v) => !v)}
            className="flex items-center gap-2 flex-1 hover:opacity-70 transition-opacity"
          >
            {generationsCollapsed ? (
              <ChevronRight className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            )}
            <FileDown className="h-4 w-4 text-gray-500" />
            <span className="text-base font-semibold text-gray-700">Генерация</span>
            <span className="text-sm text-gray-400">{generations.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setCreateGenOpen(true)}
            className="flex items-center text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
            title="Добавить блок генерации"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {!generationsCollapsed && (
          <div>
            {generations.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-4">
                Нет блоков генерации
              </div>
            ) : (
              generations.map((gen) => (
                <GenerationCard
                  key={gen.id}
                  generation={gen}
                  workspaceId={workspaceId}
                  projectId={projectId}
                  folders={folders}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Раздел: Загруженные */}
      <div className="border-t border-gray-200 mt-2">
        <button
          type="button"
          onClick={() => handlers.onUnassignedCollapsedChange(!unassignedCollapsed)}
          className="w-full flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 bg-gray-100/80 hover:bg-gray-100 transition-colors"
        >
          {unassignedCollapsed ? (
            <ChevronRight className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          )}
          <span className="text-base font-semibold text-gray-700">Загруженные</span>
          <span className="text-sm text-gray-400">{ungroupedDocuments.length}</span>
        </button>
        <UnassignedSection
          documents={ungroupedDocuments}
          isCollapsed={unassignedCollapsed}
          draggedDocId={draggedDocId}
          dragOverFolderId={dragOverFolderId}
          draggedSourceDoc={draggedSourceDoc}
          onFolderDragOver={handlers.onFolderDragOver}
          onFolderDragLeave={handlers.onFolderDragLeave}
          onFolderDrop={handlers.onFolderDrop}
        />
      </div>

      {/* Раздел: Из источника */}
      <div className="border-t border-gray-200 mt-2">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 bg-gray-100/80">
          <button
            type="button"
            onClick={() => handlers.onSourceCollapsedChange(!sourceCollapsed)}
            className="flex items-center gap-2 flex-1 hover:opacity-70 transition-opacity"
          >
            {sourceCollapsed ? (
              <ChevronRight className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            )}
            <span className="text-base font-semibold text-gray-700">Из источника</span>
            <span className="text-sm text-gray-400">{sourceDocuments.length}</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!isSyncing) handlers.onSyncSource()
              }}
              disabled={isSyncing}
              className={`flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800 transition-colors ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Синхронизировать"
            >
              <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => handlers.onShowHiddenSourceDocsChange()}
              className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800 transition-colors"
              title={showHiddenSourceDocs ? 'Скрыть помеченные' : 'Показать все'}
            >
              {showHiddenSourceDocs ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            </button>
            <button
              type="button"
              onClick={() => handlers.onOpenSourceSettings()}
              className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
              title="Настройки источника"
            >
              <Settings className="h-3 w-3" />
            </button>
            {isSourceConnected && sourceFolderName && (
              <span
                className="flex items-center gap-1 text-[11px] text-gray-500 truncate max-w-[80px]"
                title={sourceFolderName}
              >
                <svg viewBox="0 0 87.3 78" className="h-3 w-3 shrink-0" aria-hidden="true">
                  <path
                    d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
                    fill="#0066da"
                  />
                  <path
                    d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z"
                    fill="#00ac47"
                  />
                  <path
                    d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"
                    fill="#ea4335"
                  />
                  <path
                    d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
                    fill="#00832d"
                  />
                  <path
                    d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
                    fill="#2684fc"
                  />
                  <path
                    d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z"
                    fill="#ffba00"
                  />
                </svg>
              </span>
            )}
          </div>
        </div>
        <SourceSection
          documents={sourceDocuments}
          isCollapsed={sourceCollapsed}
          isSyncing={isSyncing}
          selectedDocuments={selectedDocuments}
          hasSelection={hasSelection}
          draggedSourceDoc={draggedSourceDoc}
          onSelectDocument={handlers.onSelectDocument}
          onToggleSourceDocHidden={handlers.onToggleSourceDocHidden}
          onToggleFolderHidden={handlers.onToggleFolderHidden}
          onDownloadSourceDocument={handlers.onDownloadSourceDocument}
          onMoveSourceDocument={handlers.onMoveSourceDocument}
          onSourceDocDragStart={handlers.onSourceDocDragStart}
          onSourceDocDragEnd={handlers.onSourceDocDragEnd}
        />
      </div>

      <CreateGenerationDialog
        open={createGenOpen}
        onOpenChange={setCreateGenOpen}
        projectId={projectId}
        workspaceId={workspaceId}
      />
    </>
  )
})
