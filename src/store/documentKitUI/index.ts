"use client"

/**
 * DocumentKit UI Store
 *
 * Zustand store для управления всем UI состоянием вкладки Document Kits.
 * Заменяет громоздкий documentKitReducer (699 строк, 85+ actions).
 *
 * Архитектура:
 * - 4 изолированных slices по функциональности
 * - Чистое разделение concerns
 * - TypeScript типы для безопасности
 * - Легко тестируется и расширяется
 *
 * Slices:
 * - uiSlice: UI состояние (collapse, hover, tabs, фильтры)
 * - dialogsSlice: Управление всеми диалогами (20+ диалогов)
 * - operationsSlice: Операции с документами (AI check, merge, compress, export)
 * - googleDriveSlice: Интеграция с Google Drive (source, destination)
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { createUISlice, type UISlice } from './uiSlice'
import { createDialogsSlice, type DialogsSlice } from './dialogsSlice'
import { createOperationsSlice, type OperationsSlice } from './operationsSlice'
import { createGoogleDriveSlice, type GoogleDriveSlice } from './googleDriveSlice'

// Объединённый тип всего store
export type DocumentKitUIStore = UISlice &
  DialogsSlice &
  OperationsSlice &
  GoogleDriveSlice & {
    // Global actions
    resetState: () => void
  }

// Создание store с объединением всех slices
export const useDocumentKitUIStore = create<DocumentKitUIStore>()(
  devtools(
    (...args) => ({
      ...createUISlice(...args),
      ...createDialogsSlice(...args),
      ...createOperationsSlice(...args),
      ...createGoogleDriveSlice(...args),

      // Global reset
      resetState: () => {
        const [set] = args
        set({
          // UI
          collapsedFolders: new Set(),
          uploadingFiles: [],
          targetFolderId: null,
          hoveredFolderId: null,
          hoveredDocumentId: null,
          systemSectionTab: 'unassigned',
          unassignedCollapsed: false,
          sourceCollapsed: false,
          destinationCollapsed: false,
          trashCollapsed: false,
          showOnlyUnverified: false,
          statusDropdownOpen: null,

          // Dialogs
          moveDialogOpen: false,
          documentToMove: null,
          sourceDocToMove: null,
          isMovingSourceDoc: false,
          isBatchMoving: false,
          editDialogOpen: false,
          documentToEdit: null,
          editName: '',
          editDescription: '',
          editStatus: '',
          contentViewDialogOpen: false,
          documentContent: null,
          batchCheckDialogOpen: false,
          batchCheckDocumentIds: [],
          addFolderDialogOpen: false,
          templateSelectDialogOpen: false,
          editingFolder: null,
          folderFormData: {
            name: '',
            description: '',
            aiNamingPrompt: '',
            aiCheckPrompt: '',
            knowledgeArticleId: null,
          },
          folderTemplates: [],
          loadingTemplates: false,
          selectedTemplateIds: [],
          kitSettingsDialogOpen: false,

          // Operations
          isCheckingDocument: false,
          suggestedNames: [],
          isLoadingContent: false,
          isCheckingBatch: false,
          checkProgress: null,
          isMerging: false,
          mergeProgress: null,
          mergeDialogOpen: false,
          mergeName: '',
          mergeFolderId: null,
          isGeneratingMergeName: false,
          mergeDocsList: [],
          draggedIndex: null,
          isCompressing: false,
          compressProgress: null,
          compressingDocIds: new Set<string>(),
          isExportingToDisk: false,
          exportProgress: null,
          exportToDiskDialogOpen: false,
          googleDriveFolderLink: '',
          exportSyncMode: 'replace_all' as const,
          exportPhase: 'idle' as const,
          exportDocuments: [],
          exportCleaningProgress: 0,
          exportProgressDialogOpen: false,

          // Google Drive
          connectSourceDialogOpen: false,
          sourceFolderLink: '',
          sourceSettingsDialogOpen: false,
          sourceFolderName: '',
          isSourceConnected: false,
          sourceDocuments: [],
          isSyncing: false,
          showHiddenSourceDocs: false,
          exportFolderName: '',
          isExportFolderConnected: false,
          destinationDocuments: [],
          isExporting: false,
          isFetchingDestination: false,
          hasExported: false,
        })
      },
    }),
    {
      name: 'DocumentKitUI',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
)

// Re-export types для удобства
export type { UISlice, DialogsSlice, OperationsSlice, GoogleDriveSlice }

// Re-export общих типов
export * from './types'

// Re-export хуков-селекторов
export {
  useDocumentKitUI,
  useDocumentKitDialogs,
  useDocumentKitOperations,
  useDocumentKitGoogleDrive,
} from './selectors'

// Селекторы для оптимизации (можно использовать с shallow для предотвращения лишних ререндеров)
export const selectUI = (state: DocumentKitUIStore) => ({
  collapsedFolders: state.collapsedFolders,
  uploadingFiles: state.uploadingFiles,
  targetFolderId: state.targetFolderId,
  hoveredFolderId: state.hoveredFolderId,
  hoveredDocumentId: state.hoveredDocumentId,
  systemSectionTab: state.systemSectionTab,
  unassignedCollapsed: state.unassignedCollapsed,
  sourceCollapsed: state.sourceCollapsed,
  destinationCollapsed: state.destinationCollapsed,
  trashCollapsed: state.trashCollapsed,
  showOnlyUnverified: state.showOnlyUnverified,
  statusDropdownOpen: state.statusDropdownOpen,
})

export const selectDialogs = (state: DocumentKitUIStore) => ({
  moveDialogOpen: state.moveDialogOpen,
  documentToMove: state.documentToMove,
  sourceDocToMove: state.sourceDocToMove,
  isMovingSourceDoc: state.isMovingSourceDoc,
  isBatchMoving: state.isBatchMoving,
  editDialogOpen: state.editDialogOpen,
  documentToEdit: state.documentToEdit,
  editName: state.editName,
  editDescription: state.editDescription,
  editStatus: state.editStatus,
  contentViewDialogOpen: state.contentViewDialogOpen,
  documentContent: state.documentContent,
  batchCheckDialogOpen: state.batchCheckDialogOpen,
  batchCheckDocumentIds: state.batchCheckDocumentIds,
  addFolderDialogOpen: state.addFolderDialogOpen,
  templateSelectDialogOpen: state.templateSelectDialogOpen,
  editingFolder: state.editingFolder,
  folderFormData: state.folderFormData,
  folderTemplates: state.folderTemplates,
  loadingTemplates: state.loadingTemplates,
  selectedTemplateIds: state.selectedTemplateIds,
  kitSettingsDialogOpen: state.kitSettingsDialogOpen,
})

export const selectOperations = (state: DocumentKitUIStore) => ({
  isCheckingDocument: state.isCheckingDocument,
  suggestedNames: state.suggestedNames,
  isLoadingContent: state.isLoadingContent,
  isCheckingBatch: state.isCheckingBatch,
  checkProgress: state.checkProgress,
  isMerging: state.isMerging,
  mergeProgress: state.mergeProgress,
  mergeDialogOpen: state.mergeDialogOpen,
  mergeName: state.mergeName,
  mergeFolderId: state.mergeFolderId,
  isGeneratingMergeName: state.isGeneratingMergeName,
  mergeDocsList: state.mergeDocsList,
  draggedIndex: state.draggedIndex,
  isCompressing: state.isCompressing,
  compressProgress: state.compressProgress,
  compressingDocIds: state.compressingDocIds,
  isExportingToDisk: state.isExportingToDisk,
  exportProgress: state.exportProgress,
  exportToDiskDialogOpen: state.exportToDiskDialogOpen,
  googleDriveFolderLink: state.googleDriveFolderLink,
  exportSyncMode: state.exportSyncMode,
  exportPhase: state.exportPhase,
  exportDocuments: state.exportDocuments,
  exportCleaningProgress: state.exportCleaningProgress,
  exportProgressDialogOpen: state.exportProgressDialogOpen,
})

export const selectGoogleDrive = (state: DocumentKitUIStore) => ({
  connectSourceDialogOpen: state.connectSourceDialogOpen,
  sourceFolderLink: state.sourceFolderLink,
  sourceSettingsDialogOpen: state.sourceSettingsDialogOpen,
  sourceFolderName: state.sourceFolderName,
  isSourceConnected: state.isSourceConnected,
  sourceDocuments: state.sourceDocuments,
  isSyncing: state.isSyncing,
  showHiddenSourceDocs: state.showHiddenSourceDocs,
  exportFolderName: state.exportFolderName,
  isExportFolderConnected: state.isExportFolderConnected,
  destinationDocuments: state.destinationDocuments,
  isExporting: state.isExporting,
  isFetchingDestination: state.isFetchingDestination,
  hasExported: state.hasExported,
})
