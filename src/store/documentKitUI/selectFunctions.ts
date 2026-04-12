/**
 * Чистые select-функции для DocumentKitUI Store.
 * Вынесены из index.ts, чтобы selectors.ts и index.ts не образовывали цикл:
 * index.ts использовал их напрямую, selectors.ts импортировал через index.ts.
 */

import type { DocumentKitUIStore } from './types-store'

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
  isSyncing: state.isSyncing,
  showHiddenSourceDocs: state.showHiddenSourceDocs,
  exportFolderName: state.exportFolderName,
  isExportFolderConnected: state.isExportFolderConnected,
  isExporting: state.isExporting,
  isFetchingDestination: state.isFetchingDestination,
  hasExported: state.hasExported,
})

// ─── Granular selectors ─────────────────────────────────────────────────────
// Each function picks only the fields a specific UI concern needs,
// so components subscribe to the minimum state surface.

/** Edit document dialog — form fields + AI check */
export const selectEditDialog = (state: DocumentKitUIStore) => ({
  editDialogOpen: state.editDialogOpen,
  documentToEdit: state.documentToEdit,
  editName: state.editName,
  editDescription: state.editDescription,
  editStatus: state.editStatus,
  suggestedNames: state.suggestedNames,
  isCheckingDocument: state.isCheckingDocument,
})

/** Content view dialog */
export const selectContentView = (state: DocumentKitUIStore) => ({
  contentViewDialogOpen: state.contentViewDialogOpen,
  documentContent: state.documentContent,
  isLoadingContent: state.isLoadingContent,
})

/** Move document dialog */
export const selectMoveDialog = (state: DocumentKitUIStore) => ({
  moveDialogOpen: state.moveDialogOpen,
  documentToMove: state.documentToMove,
  sourceDocToMove: state.sourceDocToMove,
  isMovingSourceDoc: state.isMovingSourceDoc,
  isBatchMoving: state.isBatchMoving,
})

/** Merge documents dialog */
export const selectMergeDialog = (state: DocumentKitUIStore) => ({
  mergeDialogOpen: state.mergeDialogOpen,
  mergeDocsList: state.mergeDocsList,
  mergeName: state.mergeName,
  mergeFolderId: state.mergeFolderId,
  isMerging: state.isMerging,
  isGeneratingMergeName: state.isGeneratingMergeName,
  draggedIndex: state.draggedIndex,
})

/** Export to Google Drive dialog + progress */
export const selectExportDialog = (state: DocumentKitUIStore) => ({
  exportToDiskDialogOpen: state.exportToDiskDialogOpen,
  isExportingToDisk: state.isExportingToDisk,
  googleDriveFolderLink: state.googleDriveFolderLink,
  exportSyncMode: state.exportSyncMode,
  exportPhase: state.exportPhase,
  exportDocuments: state.exportDocuments,
  exportCleaningProgress: state.exportCleaningProgress,
  exportProgressDialogOpen: state.exportProgressDialogOpen,
  exportProgress: state.exportProgress,
})

/** Folder / template dialogs */
export const selectFolderDialogs = (state: DocumentKitUIStore) => ({
  addFolderDialogOpen: state.addFolderDialogOpen,
  templateSelectDialogOpen: state.templateSelectDialogOpen,
  editingFolder: state.editingFolder,
  folderFormData: state.folderFormData,
  folderTemplates: state.folderTemplates,
  loadingTemplates: state.loadingTemplates,
  selectedTemplateIds: state.selectedTemplateIds,
  kitSettingsDialogOpen: state.kitSettingsDialogOpen,
})

/** Batch check dialog */
export const selectBatchCheck = (state: DocumentKitUIStore) => ({
  batchCheckDialogOpen: state.batchCheckDialogOpen,
  batchCheckDocumentIds: state.batchCheckDocumentIds,
  isCheckingBatch: state.isCheckingBatch,
  checkProgress: state.checkProgress,
})

/** Compress operations */
export const selectCompress = (state: DocumentKitUIStore) => ({
  isCompressing: state.isCompressing,
  compressProgress: state.compressProgress,
  compressingDocIds: state.compressingDocIds,
})

/** Source connection info (name + connected status) */
export const selectSourceConnection = (state: DocumentKitUIStore) => ({
  sourceFolderName: state.sourceFolderName,
  isSourceConnected: state.isSourceConnected,
})

/** Source settings dialog */
export const selectSourceSettings = (state: DocumentKitUIStore) => ({
  sourceSettingsDialogOpen: state.sourceSettingsDialogOpen,
  isSourceConnected: state.isSourceConnected,
  sourceFolderName: state.sourceFolderName,
  sourceFolderLink: state.sourceFolderLink,
})

/** Connect source dialog */
export const selectConnectSource = (state: DocumentKitUIStore) => ({
  connectSourceDialogOpen: state.connectSourceDialogOpen,
  sourceFolderLink: state.sourceFolderLink,
})

/** Kit settings dialog — includes both source and export info */
export const selectKitSettings = (state: DocumentKitUIStore) => ({
  kitSettingsDialogOpen: state.kitSettingsDialogOpen,
  isSourceConnected: state.isSourceConnected,
  sourceFolderName: state.sourceFolderName,
  sourceFolderLink: state.sourceFolderLink,
  isExportFolderConnected: state.isExportFolderConnected,
  exportFolderName: state.exportFolderName,
  googleDriveFolderLink: state.googleDriveFolderLink,
})
