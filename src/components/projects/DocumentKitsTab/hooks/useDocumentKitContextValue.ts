"use client"

/**
 * Хук для построения полного DocumentKitContext value
 * Объединяет данные, UI state и handlers в единый мемоизированный объект
 */

import { useMemo } from 'react'
import type {
  DocumentKitContextValue,
  DocumentKitData,
  DocumentKitUIState,
  DocumentKitHandlers,
} from '../context/DocumentKitContext'
import type {
  DocumentWithFiles,
  SourceDocument,
  DestinationDocument,
  DocumentStatus,
  FolderSlotWithDocument,
  DragOverPosition,
  Folder,
  DocumentKit,
} from '@/components/documents/types'

// ============== Типы параметров ==============

interface DocumentKitDataParams {
  kit: DocumentKit | null | undefined
  folders: Folder[]
  statuses: DocumentStatus[]
  folderStatuses: DocumentStatus[]
  ungroupedDocuments: DocumentWithFiles[]
  sourceDocuments: SourceDocument[]
  destinationDocuments: DestinationDocument[]
  trashedDocuments: DocumentWithFiles[]
  folderSlots: FolderSlotWithDocument[]
}

interface DocumentKitUIStateParams {
  selectedDocuments: Set<string>
  hasSelection: boolean
  hoveredDocumentId: string | null
  hoveredFolderId: string | null
  draggedDocId: string | null
  dragOverDocId: string | null
  dragOverPosition: DragOverPosition
  dragOverFolderId: string | null
  draggedSourceDoc: SourceDocument | null
  showOnlyUnverified: boolean
  collapsedFolders: Set<string>
  unassignedCollapsed: boolean
  sourceCollapsed: boolean
  destinationCollapsed: boolean
  trashCollapsed: boolean
  activeTab: 'unassigned' | 'source' | 'destination' | 'trash'
  isUploading: boolean
  compressingDocIds: Set<string>
  isSyncing: boolean
  isExporting: boolean
  isFetchingDestination: boolean
  hasExported: boolean
  exportPhase: 'idle' | 'cleaning' | 'uploading' | 'completed'
  showHiddenSourceDocs: boolean
  editingSlotId: string | null
}

interface UseDocumentKitContextValueParams {
  projectId: string
  workspaceId: string
  data: DocumentKitDataParams
  uiState: DocumentKitUIStateParams
  handlers: DocumentKitHandlers // Фаза 3: Обязательные handlers
}

// ============== Хук ==============

/**
 * Хук для создания мемоизированного Context value
 * Оптимизирует производительность через правильную мемоизацию
 */
export function useDocumentKitContextValue(
  params: UseDocumentKitContextValueParams,
): DocumentKitContextValue {
  // Мемоизация data (изменяется редко)
  const data: DocumentKitData = useMemo(
    () => ({
      kit: params.data.kit,
      folders: params.data.folders,
      statuses: params.data.statuses,
      folderStatuses: params.data.folderStatuses,
      ungroupedDocuments: params.data.ungroupedDocuments,
      sourceDocuments: params.data.sourceDocuments,
      destinationDocuments: params.data.destinationDocuments,
      trashedDocuments: params.data.trashedDocuments,
      folderSlots: params.data.folderSlots,
    }),
    [
      params.data.kit,
      params.data.folders,
      params.data.statuses,
      params.data.folderStatuses,
      params.data.ungroupedDocuments,
      params.data.sourceDocuments,
      params.data.destinationDocuments,
      params.data.trashedDocuments,
      params.data.folderSlots,
    ],
  )

  // Мемоизация uiState (изменяется часто, но нужна мемоизация для селекторов)
  const uiState: DocumentKitUIState = useMemo(
    () => ({
      selectedDocuments: params.uiState.selectedDocuments,
      hasSelection: params.uiState.hasSelection,
      hoveredDocumentId: params.uiState.hoveredDocumentId,
      hoveredFolderId: params.uiState.hoveredFolderId,
      draggedDocId: params.uiState.draggedDocId,
      dragOverDocId: params.uiState.dragOverDocId,
      dragOverPosition: params.uiState.dragOverPosition,
      dragOverFolderId: params.uiState.dragOverFolderId,
      draggedSourceDoc: params.uiState.draggedSourceDoc,
      showOnlyUnverified: params.uiState.showOnlyUnverified,
      collapsedFolders: params.uiState.collapsedFolders,
      unassignedCollapsed: params.uiState.unassignedCollapsed,
      sourceCollapsed: params.uiState.sourceCollapsed,
      destinationCollapsed: params.uiState.destinationCollapsed,
      trashCollapsed: params.uiState.trashCollapsed,
      activeTab: params.uiState.activeTab,
      isUploading: params.uiState.isUploading,
      compressingDocIds: params.uiState.compressingDocIds,
      isSyncing: params.uiState.isSyncing,
      isExporting: params.uiState.isExporting,
      isFetchingDestination: params.uiState.isFetchingDestination,
      hasExported: params.uiState.hasExported,
      exportPhase: params.uiState.exportPhase,
      showHiddenSourceDocs: params.uiState.showHiddenSourceDocs,
      editingSlotId: params.uiState.editingSlotId,
    }),
    [
      params.uiState.selectedDocuments,
      params.uiState.hasSelection,
      params.uiState.hoveredDocumentId,
      params.uiState.hoveredFolderId,
      params.uiState.draggedDocId,
      params.uiState.dragOverDocId,
      params.uiState.dragOverPosition,
      params.uiState.dragOverFolderId,
      params.uiState.draggedSourceDoc,
      params.uiState.showOnlyUnverified,
      params.uiState.collapsedFolders,
      params.uiState.unassignedCollapsed,
      params.uiState.sourceCollapsed,
      params.uiState.destinationCollapsed,
      params.uiState.trashCollapsed,
      params.uiState.activeTab,
      params.uiState.isUploading,
      params.uiState.compressingDocIds,
      params.uiState.isSyncing,
      params.uiState.isExporting,
      params.uiState.isFetchingDestination,
      params.uiState.hasExported,
      params.uiState.exportPhase,
      params.uiState.showHiddenSourceDocs,
      params.uiState.editingSlotId,
    ],
  )

  // Финальный Context value (Фаза 3: handlers теперь обязательны)
  const contextValue: DocumentKitContextValue = useMemo(
    () => ({
      data,
      uiState,
      handlers: params.handlers,
      projectId: params.projectId,
      workspaceId: params.workspaceId,
    }),
    [data, uiState, params.handlers, params.projectId, params.workspaceId],
  )

  return contextValue
}
