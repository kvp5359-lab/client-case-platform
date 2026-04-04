"use client"

/**
 * Handlers для операций с папками, UI state и source/destination
 * Выделено из useDocumentKitContextHandlers для разделения ответственности
 */

import { useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { SourceDocument, Folder } from '@/components/documents/types'

interface UseFolderAndUIHandlersParams {
  handlers: {
    handleExportToGoogleDrive: () => void
  }
  sourceOps: {
    toggleSourceDocumentHidden: (fileId: string, isHidden: boolean) => Promise<void>
    handleToggleFolderHidden: (folderName: string, hide: boolean) => Promise<void>
    handleDownloadSourceDocument: (file: SourceDocument) => Promise<void>
    handleSyncSource: () => Promise<void>
  }
  destinationOps: {
    handleFetchDestination: () => Promise<void>
    handleOpenDestinationInDrive: () => void
  }
  folderOps: {
    toggleFolder: (folderId: string) => void
    handleEditFolder: (folder: Folder) => void
    handleDeleteFolder: (folderId: string) => void
    handleFolderDocumentsClick: (folderId: string) => void
  }
  openSourceMoveDialog: (file: SourceDocument) => void
  openSourceSettingsDialog: () => void
  openDestinationSettingsDialog: () => void
  setHoveredFolder: (folderId: string | null) => void
  setSystemSectionTab: (tab: 'unassigned' | 'destination' | 'trash') => void
  setUnassignedCollapsed: (collapsed: boolean) => void
  setSourceCollapsed: (collapsed: boolean) => void
  setDestinationCollapsed: (collapsed: boolean) => void
  setTrashCollapsed: (collapsed: boolean) => void
  toggleShowHiddenSourceDocs: () => void
  projectId: string
  fetchDocumentKits: (projectId: string) => Promise<void>
  sourceDocuments: SourceDocument[]
}

export function useFolderAndUIHandlers(params: UseFolderAndUIHandlersParams) {
  const {
    handlers,
    sourceOps,
    destinationOps,
    folderOps,
    openSourceMoveDialog,
    openSourceSettingsDialog,
    openDestinationSettingsDialog,
    setHoveredFolder,
    setSystemSectionTab,
    setUnassignedCollapsed,
    setSourceCollapsed,
    setDestinationCollapsed,
    setTrashCollapsed,
    toggleShowHiddenSourceDocs,
    projectId,
    fetchDocumentKits,
    sourceDocuments,
  } = params

  // === Source operations (нужен useCallback — зависят от данных) ===

  const onToggleSourceDocHidden = useCallback(
    (docId: string) => {
      const sourceDoc = sourceDocuments.find((d) => d.id === docId)
      if (sourceDoc) {
        sourceOps.toggleSourceDocumentHidden(
          sourceDoc.sourceDocumentId,
          sourceDoc.isHidden || false,
        )
      }
    },
    [sourceDocuments, sourceOps],
  )

  const onFolderStatusChange = useCallback(
    async (folderId: string, statusId: string | null) => {
      const { error } = await supabase
        .from('folders')
        .update({ status: statusId })
        .eq('id', folderId)
      if (error) {
        // Z3-16: показываем ошибку пользователю
        const { toast } = await import('sonner')
        toast.error('Не удалось обновить статус папки')
        return
      }
      await fetchDocumentKits(projectId)
    },
    [fetchDocumentKits, projectId],
  )

  return useMemo(
    () => ({
      // UI state changes — Zustand actions, уже стабильные ссылки
      onTabChange: setSystemSectionTab,
      onUnassignedCollapsedChange: setUnassignedCollapsed,
      onSourceCollapsedChange: setSourceCollapsed,
      onDestinationCollapsedChange: setDestinationCollapsed,
      onTrashCollapsedChange: setTrashCollapsed,

      // Folder operations — прямые проксирования
      onToggleFolder: folderOps.toggleFolder,
      onHoverFolder: setHoveredFolder,
      onEditFolder: folderOps.handleEditFolder,
      onDeleteFolder: folderOps.handleDeleteFolder,
      onAddDocumentToFolder: folderOps.handleFolderDocumentsClick,
      onFolderStatusChange,

      // Source operations
      onToggleSourceDocHidden,
      onToggleFolderHidden: sourceOps.handleToggleFolderHidden,
      onDownloadSourceDocument: sourceOps.handleDownloadSourceDocument,
      onMoveSourceDocument: openSourceMoveDialog,
      onSyncSource: sourceOps.handleSyncSource,
      onShowHiddenSourceDocsChange: toggleShowHiddenSourceDocs,
      onOpenSourceSettings: openSourceSettingsDialog,

      // Destination operations
      onExportToDestination: handlers.handleExportToGoogleDrive,
      onFetchDestination: destinationOps.handleFetchDestination,
      onOpenDestinationInDrive: destinationOps.handleOpenDestinationInDrive,
      onOpenDestinationSettings: openDestinationSettingsDialog,
    }),
    [
      setSystemSectionTab,
      setUnassignedCollapsed,
      setSourceCollapsed,
      setDestinationCollapsed,
      setTrashCollapsed,
      folderOps.toggleFolder,
      setHoveredFolder,
      folderOps.handleEditFolder,
      folderOps.handleDeleteFolder,
      folderOps.handleFolderDocumentsClick,
      onFolderStatusChange,
      onToggleSourceDocHidden,
      sourceOps.handleToggleFolderHidden,
      sourceOps.handleDownloadSourceDocument,
      openSourceMoveDialog,
      sourceOps.handleSyncSource,
      toggleShowHiddenSourceDocs,
      openSourceSettingsDialog,
      handlers.handleExportToGoogleDrive,
      destinationOps.handleFetchDestination,
      destinationOps.handleOpenDestinationInDrive,
      openDestinationSettingsDialog,
    ],
  )
}
