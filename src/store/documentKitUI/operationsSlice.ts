"use client"

/**
 * Operations Slice - управление длительными операциями (merge, compress, AI check, export)
 */

import { StateCreator } from 'zustand'
import type { Progress, ExportPhase, SyncMode, MergeDoc, ExportDocument } from './types'

export interface OperationsState {
  // AI check
  isCheckingDocument: boolean
  suggestedNames: string[]
  isLoadingContent: boolean
  isCheckingBatch: boolean
  checkProgress: Progress | null

  // Merge
  isMerging: boolean
  mergeProgress: Progress | null
  mergeDialogOpen: boolean
  mergeName: string
  mergeFolderId: string | null
  isGeneratingMergeName: boolean
  mergeDocsList: MergeDoc[]
  draggedIndex: number | null

  // Compress
  isCompressing: boolean
  compressProgress: Progress | null
  compressingDocIds: Set<string>

  // Export to disk (Google Drive)
  isExportingToDisk: boolean
  exportProgress: Progress | null
  exportToDiskDialogOpen: boolean
  googleDriveFolderLink: string
  exportSyncMode: SyncMode
  exportPhase: ExportPhase
  exportDocuments: ExportDocument[]
  exportCleaningProgress: number
  exportProgressDialogOpen: boolean
}

export interface OperationsActions {
  // AI check
  setCheckingDocument: (isChecking: boolean) => void
  setSuggestedNames: (names: string[]) => void
  setLoadingContent: (isLoading: boolean) => void
  setCheckingBatch: (isChecking: boolean, progress?: Progress | null) => void

  // Merge
  openMergeDialog: (
    documents: Array<{ id: string; name: string; size: number }>,
    folderId?: string | null,
  ) => void
  closeMergeDialog: () => void
  updateMergeName: (name: string) => void
  setMergeFolder: (folderId: string | null) => void
  setGeneratingMergeName: (isGenerating: boolean) => void
  setMerging: (isMerging: boolean, progress?: Progress | null) => void
  reorderMergeDocs: (fromIndex: number, toIndex: number) => void
  setDraggedIndex: (index: number | null) => void

  // Compress
  addCompressingDoc: (documentId: string) => void
  removeCompressingDoc: (documentId: string) => void
  setCompressProgress: (progress: Progress | null) => void

  // Export to disk
  openExportDialog: () => void
  closeExportDialog: () => void
  setGoogleDriveFolderLink: (link: string) => void
  setExportSyncMode: (mode: SyncMode) => void
  setExporting: (isExporting: boolean, progress?: Progress | null) => void
  setExportPhase: (phase: ExportPhase) => void
  setExportDocuments: (documents: ExportDocument[]) => void
  updateExportDocumentStatus: (
    documentId: string,
    status: ExportDocument['status'],
    progress?: number,
    error?: string,
  ) => void
  setExportCleaningProgress: (progress: number) => void
  openExportProgressDialog: () => void
  closeExportProgressDialog: () => void
}

export type OperationsSlice = OperationsState & OperationsActions

const initialOperationsState: OperationsState = {
  // AI check
  isCheckingDocument: false,
  suggestedNames: [],
  isLoadingContent: false,
  isCheckingBatch: false,
  checkProgress: null,

  // Merge
  isMerging: false,
  mergeProgress: null,
  mergeDialogOpen: false,
  mergeName: '',
  mergeFolderId: null,
  isGeneratingMergeName: false,
  mergeDocsList: [],
  draggedIndex: null,

  // Compress
  isCompressing: false,
  compressProgress: null,
  compressingDocIds: new Set<string>(),

  // Export to disk
  isExportingToDisk: false,
  exportProgress: null,
  exportToDiskDialogOpen: false,
  googleDriveFolderLink: '',
  exportSyncMode: 'replace_all',
  exportPhase: 'idle',
  exportDocuments: [],
  exportCleaningProgress: 0,
  exportProgressDialogOpen: false,
}

export const createOperationsSlice: StateCreator<OperationsSlice, [], [], OperationsSlice> = (
  set,
) => ({
  ...initialOperationsState,

  // AI check
  setCheckingDocument: (isChecking) => set({ isCheckingDocument: isChecking }),
  setSuggestedNames: (names) => set({ suggestedNames: names }),
  setLoadingContent: (isLoading) => set({ isLoadingContent: isLoading }),
  setCheckingBatch: (isChecking, progress = null) =>
    set({
      isCheckingBatch: isChecking,
      checkProgress: progress,
    }),

  // Merge
  openMergeDialog: (documents, folderId = null) =>
    set({
      mergeDialogOpen: true,
      mergeDocsList: documents.map((doc, index) => ({ ...doc, order: index })),
      mergeName: '',
      mergeFolderId: folderId,
    }),

  closeMergeDialog: () =>
    set({
      mergeDialogOpen: false,
      mergeDocsList: [],
      mergeName: '',
      mergeFolderId: null,
    }),

  updateMergeName: (name) => set({ mergeName: name }),
  setMergeFolder: (folderId) => set({ mergeFolderId: folderId }),
  setGeneratingMergeName: (isGenerating) => set({ isGeneratingMergeName: isGenerating }),
  setMerging: (isMerging, progress = null) =>
    set({
      isMerging,
      mergeProgress: progress,
    }),

  reorderMergeDocs: (fromIndex, toIndex) =>
    set((state) => {
      const newList = [...state.mergeDocsList]
      const [movedItem] = newList.splice(fromIndex, 1)
      newList.splice(toIndex, 0, movedItem)
      return {
        mergeDocsList: newList.map((doc, index) => ({ ...doc, order: index })),
      }
    }),

  setDraggedIndex: (index) => set({ draggedIndex: index }),

  // Compress
  addCompressingDoc: (documentId) =>
    set((state) => {
      const next = new Set(state.compressingDocIds)
      next.add(documentId)
      return { compressingDocIds: next, isCompressing: true }
    }),
  removeCompressingDoc: (documentId) =>
    set((state) => {
      const next = new Set(state.compressingDocIds)
      next.delete(documentId)
      return {
        compressingDocIds: next,
        isCompressing: next.size > 0,
        compressProgress: next.size > 0 ? state.compressProgress : null,
      }
    }),
  setCompressProgress: (progress) => set({ compressProgress: progress }),

  // Export to disk
  openExportDialog: () => set({ exportToDiskDialogOpen: true }),

  closeExportDialog: () =>
    set({
      exportToDiskDialogOpen: false,
      googleDriveFolderLink: '',
    }),

  setGoogleDriveFolderLink: (link) => set({ googleDriveFolderLink: link }),
  setExportSyncMode: (mode) => set({ exportSyncMode: mode }),
  setExporting: (isExporting, progress = null) =>
    set({
      isExportingToDisk: isExporting,
      exportProgress: progress,
    }),

  setExportPhase: (phase) => set({ exportPhase: phase }),
  setExportDocuments: (documents) => set({ exportDocuments: documents }),

  updateExportDocumentStatus: (documentId, status, progress, error) =>
    set((state) => ({
      exportDocuments: state.exportDocuments.map((doc) =>
        doc.documentId === documentId ? { ...doc, status, progress, error } : doc,
      ),
    })),

  setExportCleaningProgress: (progress) => set({ exportCleaningProgress: progress }),
  openExportProgressDialog: () => set({ exportProgressDialogOpen: true }),

  closeExportProgressDialog: () =>
    set({
      exportProgressDialogOpen: false,
      exportPhase: 'idle',
      exportDocuments: [],
      exportCleaningProgress: 0,
    }),
})
