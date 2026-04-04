"use client"

/**
 * Google Drive Slice - управление интеграцией с Google Drive
 * (source documents, export folder, destination documents)
 */

import { StateCreator } from 'zustand'
import type { SourceDocument, DestinationDocument } from './types'

export interface GoogleDriveState {
  // Source documents (Google Drive папка-источник)
  connectSourceDialogOpen: boolean
  sourceFolderLink: string
  sourceSettingsDialogOpen: boolean
  sourceFolderName: string
  isSourceConnected: boolean
  sourceDocuments: SourceDocument[]
  isSyncing: boolean
  showHiddenSourceDocs: boolean

  // Export folder (Google Drive папка для экспорта)
  exportFolderName: string
  isExportFolderConnected: boolean

  // Destination documents (документы на Google Drive)
  destinationDocuments: DestinationDocument[]
  isExporting: boolean
  isFetchingDestination: boolean
  hasExported: boolean
}

export interface GoogleDriveActions {
  // Source documents
  openConnectSourceDialog: () => void
  closeConnectSourceDialog: () => void
  setSourceFolderLink: (link: string) => void
  openSourceSettingsDialog: () => void
  closeSourceSettingsDialog: () => void
  setSourceFolderName: (name: string) => void
  setSourceConnected: (isConnected: boolean) => void
  setSourceDocuments: (documents: SourceDocument[]) => void
  setSyncing: (isSyncing: boolean) => void
  toggleShowHiddenSourceDocs: () => void

  // Export folder
  setExportFolderName: (name: string) => void
  setExportFolderConnected: (isConnected: boolean) => void

  // Destination documents
  setDestinationDocuments: (documents: DestinationDocument[]) => void
  setExportingToDestination: (isExporting: boolean) => void
  setFetchingDestination: (isFetching: boolean) => void
  setHasExported: (hasExported: boolean) => void
}

export type GoogleDriveSlice = GoogleDriveState & GoogleDriveActions

const initialGoogleDriveState: GoogleDriveState = {
  // Source documents
  connectSourceDialogOpen: false,
  sourceFolderLink: '',
  sourceSettingsDialogOpen: false,
  sourceFolderName: '',
  isSourceConnected: false,
  sourceDocuments: [],
  isSyncing: false,
  showHiddenSourceDocs: false,

  // Export folder
  exportFolderName: '',
  isExportFolderConnected: false,

  // Destination documents
  destinationDocuments: [],
  isExporting: false,
  isFetchingDestination: false,
  hasExported: false,
}

export const createGoogleDriveSlice: StateCreator<GoogleDriveSlice, [], [], GoogleDriveSlice> = (set) => ({
  ...initialGoogleDriveState,

  // Source documents
  openConnectSourceDialog: () => set({ connectSourceDialogOpen: true }),
  closeConnectSourceDialog: () =>
    set({
      connectSourceDialogOpen: false,
      sourceFolderLink: '',
    }),

  setSourceFolderLink: (link) => set({ sourceFolderLink: link }),
  openSourceSettingsDialog: () => set({ sourceSettingsDialogOpen: true }),
  closeSourceSettingsDialog: () => set({ sourceSettingsDialogOpen: false }),
  setSourceFolderName: (name) => set({ sourceFolderName: name }),
  setSourceConnected: (isConnected) => set({ isSourceConnected: isConnected }),
  setSourceDocuments: (documents) => set({ sourceDocuments: documents }),
  setSyncing: (isSyncing) => set({ isSyncing: isSyncing }),
  toggleShowHiddenSourceDocs: () => set((state) => ({ showHiddenSourceDocs: !state.showHiddenSourceDocs })),

  // Export folder
  setExportFolderName: (name) => set({ exportFolderName: name }),
  setExportFolderConnected: (isConnected) => set({ isExportFolderConnected: isConnected }),

  // Destination documents
  setDestinationDocuments: (documents) => set({ destinationDocuments: documents }),
  setExportingToDestination: (isExporting) => set({ isExporting: isExporting }),
  setFetchingDestination: (isFetching) => set({ isFetchingDestination: isFetching }),
  setHasExported: (hasExported) => set({ hasExported: hasExported }),
})
