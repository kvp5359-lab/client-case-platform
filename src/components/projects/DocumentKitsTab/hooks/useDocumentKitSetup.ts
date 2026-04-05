"use client"

/**
 * useDocumentKitSetup — главный хук-оркестратор для DocumentKitsTab
 *
 * Объединяет ВСЕ хуки, эффекты и мемоизированные вычисления,
 * которые раньше жили внутри компонента DocumentKitsTabContent.
 * Компонент теперь только рендерит JSX.
 *
 * Операционные хуки — в useDocumentKitOps.
 * Эффекты и мемоизация — в useDocumentKitEffects.
 */

import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDocumentKitsQuery, useDeleteDocumentKitMutation } from '@/hooks/useDocumentKitsQuery'
import { documentKitKeys, folderSlotKeys } from '@/hooks/queryKeys'
import { useDocumentKitContextValue } from './useDocumentKitContextValue'
import { useDocumentKitContextHandlers } from './useDocumentKitContextHandlers'
import { useKitlessDocumentsQuery } from '@/hooks/documents/useKitlessDocumentsQuery'
import { useDocuments } from '@/hooks/useDocuments'
import { useFolderSlots } from '@/hooks/useFolderSlots'
import { useDocumentStatuses, useDocumentKitStatuses } from '@/hooks/useStatuses'
import { useDocumentSelection, useDocumentDragDrop } from '@/hooks/documents'
import type { SourceDocument } from '@/components/documents/types'
import {
  buildToolbarConfig,
  buildBatchActionsConfig,
  buildDialogsConfig,
} from './useDocumentKitSetupConfigs'
import { useDocumentKitOps } from './useDocumentKitOps'
import { useDocumentKitEffects } from './useDocumentKitEffects'
import { useDocumentKitPermissions } from './useDocumentKitPermissions'
import { useDocumentKitStoreState } from './useDocumentKitStoreState'
import { useDocumentKitMemos } from './useDocumentKitMemos'
import type { DocumentKitContextValue } from '../context/DocumentKitContext'

interface UseDocumentKitSetupParams {
  projectId: string
  workspaceId: string
  kitId: string
  sourceFolderId?: string | null
  exportFolderId?: string | null
}

export function useDocumentKitSetup({
  projectId,
  workspaceId,
  kitId,
  sourceFolderId,
  exportFolderId,
}: UseDocumentKitSetupParams) {
  // React Query вместо Zustand store (B-54)
  const { data: documentKits = [], isLoading } = useDocumentKitsQuery(projectId)
  // Документы без набора (document_kit_id IS NULL) — для вкладки «Новые»
  const { data: kitlessDocuments = [] } = useKitlessDocumentsQuery(projectId)
  const deleteMutation = useDeleteDocumentKitMutation()
  const { data: statuses = [] } = useDocumentStatuses(workspaceId)
  const { data: folderStatuses = [] } = useDocumentKitStatuses(workspaceId)

  // Проверка прав доступа
  const {
    requirePermission,
    canAddDocuments,
    canDeleteDocuments,
    canMoveDocuments,
    canCompressPdf,
    canDownloadDocuments,
    canCreateFolders,
    canManageSettings,
    canUseAiDocumentCheck,
  } = useDocumentKitPermissions({ projectId, workspaceId })

  // ====== Zustand store через хуки-селекторы ======
  const { uiState, dialogs, operations, googleDrive, actions } = useDocumentKitStoreState()

  const {
    showOnlyUnverified,
    uploadingFiles,
    collapsedFolders,
    hoveredFolderId,
    hoveredDocumentId,
    systemSectionTab,
    unassignedCollapsed,
    sourceCollapsed,
    destinationCollapsed,
    trashCollapsed,
  } = uiState
  const { documentToEdit, batchCheckDialogOpen, batchCheckDocumentIds, templateSelectDialogOpen } =
    dialogs
  const {
    isCheckingBatch,
    isMerging,
    mergeProgress,
    isCompressing,
    compressProgress,
    compressingDocIds,
    isExportingToDisk,
    exportProgress,
    exportPhase,
  } = operations
  const {
    sourceDocuments,
    isSyncing,
    showHiddenSourceDocs,
    destinationDocuments,
    isExporting,
    isFetchingDestination,
    hasExported,
  } = googleDrive

  // Actions напрямую из store
  const {
    setHoveredFolder,
    setHoveredDocument,
    setSystemSectionTab,
    setUnassignedCollapsed,
    setSourceCollapsed,
    setDestinationCollapsed,
    setTrashCollapsed,
    setDestinationDocuments,
    setExportingToDestination,
    setFetchingDestination,
    setHasExported,
    openMoveDialog,
    openSourceMoveDialog,
    toggleShowOnlyUnverified,
    openConnectSourceDialog,
    openSourceSettingsDialog,
    setSourceDocuments,
    setSourceConnected,
    setSourceFolderName,
    setSyncing,
    toggleShowHiddenSourceDocs,
    openTemplateSelectDialog,
    closeEditFolderDialog,
    resetFolderForm,
    openAddFolderDialog,
    setExportFolderConnected,
    setExportFolderName,
    openKitSettingsDialog,
    openBatchCheckDialog,
    closeBatchCheckDialog,
    setExportPhase,
    setExportDocuments,
    updateExportDocumentStatus,
    setExportCleaningProgress,
    openExportProgressDialog,
    closeExportProgressDialog,
  } = actions

  const queryClient = useQueryClient()

  // Обёртки для обратной совместимости со всеми вложенными хуками,
  // которые принимают fetchDocumentKits/deleteDocumentKit как колбэки
  const fetchDocumentKits = useCallback(
    async (pid: string) => {
      await queryClient.invalidateQueries({ queryKey: documentKitKeys.byProject(pid) })
      await queryClient.invalidateQueries({ queryKey: folderSlotKeys.byProject(pid) })
    },
    [queryClient],
  )

  const deleteDocumentKit = useCallback(
    async (kitId: string) => {
      await deleteMutation.mutateAsync({ kitId, projectId })
    },
    [deleteMutation, projectId],
  )

  // Мемоизированные производные данные — вынесены в useDocumentKitMemos.
  // Z3-14: folders мемоизируется, чтобы не триггерить useEffect при каждом рендере.
  const { kit, folders, allFolders, documentNamesMap, allFilteredDocuments } = useDocumentKitMemos(
    documentKits,
    kitId,
    showOnlyUnverified,
  )

  // Хуки для выбора документов и drag & drop
  const {
    selectedDocuments,
    hasSelection,
    allSelected,
    toggleSelection: toggleDocumentSelection,
    clearSelection,
    toggleSelectAll,
  } = useDocumentSelection({ allDocuments: allFilteredDocuments })

  const {
    draggedDocId,
    dragOverDocId,
    dragOverPosition,
    dragOverFolderId,
    draggedSourceDoc,
    resetDragState,
    setDraggedDoc,
    setDragOverDoc,
    setDragOverFolder,
    setDraggedSourceDoc,
  } = useDocumentDragDrop()

  const { uploadDocument, isUploading, hardDeleteDocument, reorderDocuments } =
    useDocuments(projectId)

  // Слоты документов
  const {
    slots: folderSlots,
    createSlot,
    updateSlot,
    deleteSlot,
    deleteEmptySlots,
    fillSlot,
    unlinkSlot,
    refetchSlots,
  } = useFolderSlots(projectId)

  // Функция получения документа по ID
  const getDocument = (documentId: string) => kit?.documents?.find((d) => d.id === documentId)

  // === ХУКИ ДЛЯ ОПЕРАЦИЙ (делегировано в useDocumentKitOps) ===
  const {
    documentOps,
    documentEdit,
    documentVerify,
    folderOps,
    documentMerge,
    batchOps,
    compressOps,
    exportOps,
    sourceOps,
    sourceUpload,
    batchMoveOps,
    sourceConnection,
    destinationOps,
    handlers,
    editingSlotId,
    slotFileInputRef,
    slotHandlers,
    handleSlotFileChange,
  } = useDocumentKitOps({
    projectId,
    workspaceId,
    sourceFolderId,
    exportFolderId,
    kit,
    documentKits,
    folders,
    uploadDocument,
    hardDeleteDocument,
    reorderDocuments,
    createSlot,
    updateSlot,
    deleteSlot,
    deleteEmptySlots,
    fillSlot,
    unlinkSlot,
    refetchSlots,
    fetchDocumentKits,
    getDocument,
    requirePermission,
    clearSelection,
    selectedDocuments,
    draggedDocId,
    dragOverPosition,
    draggedSourceDoc,
    resetDragState,
    openBatchCheckDialog,
    showHiddenSourceDocs,
    setSourceDocuments,
    setSyncing,
    setSystemSectionTab,
    setSourceCollapsed,
    setSourceFolderName,
    setDestinationDocuments,
    setExportingToDestination,
    setFetchingDestination,
    setHasExported,
    setExportFolderConnected,
    deleteDocumentKit,
    setExportPhase,
    setExportDocuments,
    updateExportDocumentStatus,
    setExportCleaningProgress,
    openExportProgressDialog,
    closeExportProgressDialog,
    sourceDocuments,
  })

  // === ЭФФЕКТЫ И МЕМОИЗАЦИЯ (делегировано в useDocumentKitEffects) ===
  const {
    documentsByFolder,
    ungroupedDocuments,
    trashedDocuments,
    hasTrashDocumentsSelected,
    orderedDocumentList,
  } = useDocumentKitEffects({
    folders,
    templateSelectDialogOpen,
    loadFolderTemplates: folderOps.loadFolderTemplates,
    kit,
    sourceFolderId,
    exportFolderId,
    setSourceConnected,
    setSourceFolderName,
    setExportFolderConnected,
    setExportFolderName,
    allKits: documentKits,
    showOnlyUnverified,
    folderSlots,
    selectedDocuments,
    kitlessDocuments,
  })

  // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
  const handleSelectAll = () => toggleSelectAll(allFilteredDocuments)

  // === CONTEXT HANDLERS ===
  const contextHandlers = useDocumentKitContextHandlers({
    handlers,
    documentOps,
    sourceOps,
    destinationOps,
    folderOps,
    openMoveDialog,
    openSourceMoveDialog,
    openSourceSettingsDialog,
    openDestinationSettingsDialog: openKitSettingsDialog,
    setHoveredDocument,
    setHoveredFolder,
    toggleDocumentSelection,
    setSystemSectionTab,
    setUnassignedCollapsed,
    setSourceCollapsed,
    setDestinationCollapsed,
    setTrashCollapsed,
    toggleShowHiddenSourceDocs,
    setDraggedDoc,
    setDragOverDoc,
    setDragOverFolder,
    setDraggedSourceDoc,
    resetDragState,
    projectId,
    fetchDocumentKits,
    systemSectionTab,
    sourceDocuments: sourceDocuments as SourceDocument[],
    trashedDocuments,
    ungroupedDocuments,
    orderedDocumentList,
    slotHandlers,
  })

  // === CONTEXT VALUE ===
  const contextValue: DocumentKitContextValue = useDocumentKitContextValue({
    projectId,
    workspaceId,
    data: {
      kit,
      folders,
      statuses,
      folderStatuses,
      ungroupedDocuments,
      sourceDocuments: sourceDocuments as SourceDocument[],
      destinationDocuments,
      trashedDocuments,
      folderSlots,
    },
    uiState: {
      selectedDocuments,
      hasSelection,
      hoveredDocumentId,
      hoveredFolderId,
      draggedDocId,
      dragOverDocId,
      dragOverPosition,
      dragOverFolderId,
      draggedSourceDoc,
      showOnlyUnverified,
      collapsedFolders,
      unassignedCollapsed,
      sourceCollapsed,
      destinationCollapsed,
      trashCollapsed,
      activeTab: systemSectionTab,
      isUploading,
      compressingDocIds,
      isSyncing,
      isExporting,
      isFetchingDestination,
      hasExported,
      exportPhase,
      showHiddenSourceDocs,
      editingSlotId,
    },
    handlers: contextHandlers,
  })

  return {
    // Context value для Provider
    contextValue,

    // Данные для рендера
    kit,
    isLoading,

    // File inputs
    folderFileInputRef: folderOps.fileInputRef,
    slotFileInputRef,
    handleFileChange: handlers.handleFileChange,
    handleSlotFileChange,

    // Toolbar props
    toolbar: buildToolbarConfig({
      allSelected,
      showOnlyUnverified,
      isUploading,
      uploadingFilesCount: uploadingFiles.length,
      canAddDocuments,
      canCreateFolders,
      canDownloadDocuments,
      canDeleteDocuments,
      canManageSettings,
      handleSelectAll,
      handleAddDocumentClick: folderOps.handleAddDocumentClick,
      toggleShowOnlyUnverified,
      openTemplateSelectDialog,
      closeEditFolderDialog,
      resetFolderForm,
      openAddFolderDialog,
      openConnectSourceDialog,
      openKitSettingsDialog,
      handleDelete: handlers.handleDelete,
    }),

    // Batch actions props
    batchActions: buildBatchActionsConfig({
      hasSelection,
      selectedDocuments,
      hasTrashDocumentsSelected,
      systemSectionTab,
      sourceDocuments: sourceDocuments as SourceDocument[],
      allFolders,
      statuses,
      operations: {
        isMerging,
        isCompressing,
        isCheckingBatch,
        isExportingToDisk,
        mergeProgress,
        compressProgress,
        exportProgress,
      },
      permissions: {
        canBatchCheck: canUseAiDocumentCheck,
        canCompress: canCompressPdf,
        canMove: canMoveDocuments,
        canDelete: canDeleteDocuments,
        canDownload: canDownloadDocuments,
      },
      allFilteredDocuments,
      handlers,
      clearSelection,
      sourceOps,
    }),

    // Dialogs props
    dialogs: buildDialogsConfig({
      documentOps,
      folderOps,
      documentMerge,
      batchOps,
      documentEdit,
      documentVerify,
      handlers,
      kit,
      documentToEdit,
      batchCheckDialogOpen,
      batchCheckDocumentIds,
      documentNamesMap,
      statuses,
      closeBatchCheckDialog,
      fetchDocumentKits,
      clearSelection,
      projectId,
      workspaceId,
    }),

    // Folder sections
    documentsByFolder,

    // Upload indicator
    uploadingFiles,
    ungroupedDocuments,
    folders,
  }
}
