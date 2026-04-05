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
