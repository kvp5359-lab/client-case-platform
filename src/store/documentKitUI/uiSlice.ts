"use client"

/**
 * UI Slice - управление UI состоянием (collapse, hover, tabs, etc.)
 */

import { StateCreator } from 'zustand'
import type { SystemSectionTab } from './types'

export interface UIState {
  collapsedFolders: Set<string>
  uploadingFiles: string[]
  targetFolderId: string | null
  hoveredFolderId: string | null
  hoveredDocumentId: string | null
  systemSectionTab: SystemSectionTab
  unassignedCollapsed: boolean
  sourceCollapsed: boolean
  destinationCollapsed: boolean
  trashCollapsed: boolean
  showOnlyUnverified: boolean
  statusDropdownOpen: string | null
}

export interface UIActions {
  // Folder collapse
  toggleFolderCollapse: (folderId: string) => void

  // Files upload
  setUploadingFiles: (files: string[]) => void

  // Drag & Drop
  setTargetFolder: (folderId: string | null) => void
  setHoveredFolder: (folderId: string | null) => void
  setHoveredDocument: (documentId: string | null) => void

  // Tabs & sections
  setSystemSectionTab: (tab: SystemSectionTab) => void
  toggleUnassignedCollapse: () => void
  toggleSourceCollapse: () => void
  toggleDestinationCollapse: () => void
  toggleTrashCollapse: () => void
  setUnassignedCollapsed: (collapsed: boolean) => void
  setSourceCollapsed: (collapsed: boolean) => void
  setDestinationCollapsed: (collapsed: boolean) => void
  setTrashCollapsed: (collapsed: boolean) => void

  // Filters
  toggleShowOnlyUnverified: () => void
  setStatusDropdownOpen: (documentId: string | null) => void
}

export type UISlice = UIState & UIActions

const initialUIState: UIState = {
  collapsedFolders: new Set(),
  uploadingFiles: [],
  targetFolderId: null,
  hoveredFolderId: null,
  hoveredDocumentId: null,
  systemSectionTab: (() => {
    try {
      const saved = localStorage.getItem('documentKit:activeTab')
      const valid: SystemSectionTab[] = ['unassigned', 'source', 'destination', 'trash']
      return saved && valid.includes(saved as SystemSectionTab)
        ? (saved as SystemSectionTab)
        : 'unassigned'
    } catch {
      return 'unassigned'
    }
  })(),
  unassignedCollapsed: false,
  sourceCollapsed: false,
  destinationCollapsed: false,
  trashCollapsed: false,
  showOnlyUnverified: false,
  statusDropdownOpen: null,
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  ...initialUIState,

  // Folder collapse
  toggleFolderCollapse: (folderId) =>
    set((state) => {
      const newSet = new Set(state.collapsedFolders)
      if (newSet.has(folderId)) {
        newSet.delete(folderId)
      } else {
        newSet.add(folderId)
      }
      return { collapsedFolders: newSet }
    }),

  // Files upload
  setUploadingFiles: (files) => set({ uploadingFiles: files }),

  // Drag & Drop
  setTargetFolder: (folderId) => set({ targetFolderId: folderId }),
  setHoveredFolder: (folderId) => set({ hoveredFolderId: folderId }),
  setHoveredDocument: (documentId) => set({ hoveredDocumentId: documentId }),

  // Tabs & sections
  setSystemSectionTab: (tab) => {
    localStorage.setItem('documentKit:activeTab', tab)
    set({ systemSectionTab: tab })
  },
  toggleUnassignedCollapse: () =>
    set((state) => ({ unassignedCollapsed: !state.unassignedCollapsed })),
  toggleSourceCollapse: () => set((state) => ({ sourceCollapsed: !state.sourceCollapsed })),
  toggleDestinationCollapse: () =>
    set((state) => ({ destinationCollapsed: !state.destinationCollapsed })),
  toggleTrashCollapse: () => set((state) => ({ trashCollapsed: !state.trashCollapsed })),
  setUnassignedCollapsed: (collapsed) => set({ unassignedCollapsed: collapsed }),
  setSourceCollapsed: (collapsed) => set({ sourceCollapsed: collapsed }),
  setDestinationCollapsed: (collapsed) => set({ destinationCollapsed: collapsed }),
  setTrashCollapsed: (collapsed) => set({ trashCollapsed: collapsed }),

  // Filters
  toggleShowOnlyUnverified: () =>
    set((state) => ({ showOnlyUnverified: !state.showOnlyUnverified })),
  setStatusDropdownOpen: (documentId) => set({ statusDropdownOpen: documentId }),
})
