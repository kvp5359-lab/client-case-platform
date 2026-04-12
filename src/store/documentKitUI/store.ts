"use client"

/**
 * Непосредственно zustand-store. Вынесен из index.ts чтобы selectors.ts
 * мог импортировать useDocumentKitUIStore без циклической зависимости:
 * старая схема `index -> selectors -> index` создавала cycle.
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { createUISlice } from './uiSlice'
import { createDialogsSlice } from './dialogsSlice'
import { createOperationsSlice } from './operationsSlice'
import { createGoogleDriveSlice } from './googleDriveSlice'
import type { DocumentKitUIStore } from './types-store'

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
          isSyncing: false,
          showHiddenSourceDocs: false,
          exportFolderName: '',
          isExportFolderConnected: false,
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
