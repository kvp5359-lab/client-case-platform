"use client"

/**
 * Dialogs Slice - управление всеми диалогами и их состояниями
 */

import { StateCreator } from 'zustand'
import type { Document, Folder, FolderTemplate, SourceDocument, FolderFormData } from './types'

export interface DialogsState {
  // Move dialog
  moveDialogOpen: boolean
  documentToMove: string | null
  sourceDocToMove: SourceDocument | null
  isMovingSourceDoc: boolean
  isBatchMoving: boolean

  // Edit dialog
  editDialogOpen: boolean
  documentToEdit: Document | null
  editName: string
  editDescription: string
  editStatus: string | null

  // AI check dialogs
  contentViewDialogOpen: boolean
  documentContent: string | null
  batchCheckDialogOpen: boolean
  batchCheckDocumentIds: string[]

  // Folder dialogs
  addFolderDialogOpen: boolean
  templateSelectDialogOpen: boolean
  editingFolder: Folder | null
  folderFormData: FolderFormData
  folderTemplates: FolderTemplate[]
  loadingTemplates: boolean
  selectedTemplateIds: string[]

  // Kit settings dialog
  kitSettingsDialogOpen: boolean
}

export interface DialogsActions {
  // Move dialog
  openMoveDialog: (documentId: string) => void
  closeMoveDialog: () => void
  openSourceMoveDialog: (sourceDoc: SourceDocument) => void
  closeSourceMoveDialog: () => void
  setMovingSourceDoc: (isMoving: boolean) => void
  setBatchMoving: (isMoving: boolean) => void

  // Edit dialog
  openEditDialog: (document: Document) => void
  closeEditDialog: () => void
  updateEditForm: (field: 'name' | 'description' | 'status', value: string | null) => void
  updateDocumentTextContent: (textContent: string | null) => void

  // AI check dialogs
  openContentViewDialog: (content: string) => void
  closeContentViewDialog: () => void
  openBatchCheckDialog: (documentIds: string[]) => void
  closeBatchCheckDialog: () => void

  // Folder dialogs
  openAddFolderDialog: () => void
  closeAddFolderDialog: () => void
  openEditFolderDialog: (folder: Folder) => void
  closeEditFolderDialog: () => void
  updateFolderForm: (
    field: 'name' | 'description' | 'aiNamingPrompt' | 'aiCheckPrompt' | 'knowledgeArticleId',
    value: string | null,
  ) => void
  resetFolderForm: () => void
  openTemplateSelectDialog: () => void
  closeTemplateSelectDialog: () => void
  setFolderTemplates: (templates: FolderTemplate[]) => void
  setLoadingTemplates: (isLoading: boolean) => void
  toggleTemplateSelection: (templateId: string) => void
  clearTemplateSelection: () => void

  // Kit settings dialog
  openKitSettingsDialog: () => void
  closeKitSettingsDialog: () => void
}

export type DialogsSlice = DialogsState & DialogsActions

const initialDialogsState: DialogsState = {
  // Move dialog
  moveDialogOpen: false,
  documentToMove: null,
  sourceDocToMove: null,
  isMovingSourceDoc: false,
  isBatchMoving: false,

  // Edit dialog
  editDialogOpen: false,
  documentToEdit: null,
  editName: '',
  editDescription: '',
  editStatus: '',

  // AI check dialogs
  contentViewDialogOpen: false,
  documentContent: null,
  batchCheckDialogOpen: false,
  batchCheckDocumentIds: [],

  // Folder dialogs
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

  // Kit settings dialog
  kitSettingsDialogOpen: false,
}

export const createDialogsSlice: StateCreator<DialogsSlice, [], [], DialogsSlice> = (set) => ({
  ...initialDialogsState,

  // Move dialog
  openMoveDialog: (documentId) =>
    set({
      moveDialogOpen: true,
      documentToMove: documentId,
      isMovingSourceDoc: false,
      sourceDocToMove: null,
    }),

  closeMoveDialog: () =>
    set({
      moveDialogOpen: false,
      documentToMove: null,
      sourceDocToMove: null,
      isMovingSourceDoc: false,
    }),

  openSourceMoveDialog: (sourceDoc) =>
    set({
      moveDialogOpen: true,
      sourceDocToMove: sourceDoc,
      isMovingSourceDoc: false,
      documentToMove: null,
    }),

  closeSourceMoveDialog: () =>
    set({
      moveDialogOpen: false,
      sourceDocToMove: null,
      isMovingSourceDoc: false,
    }),

  setMovingSourceDoc: (isMoving) => set({ isMovingSourceDoc: isMoving }),
  setBatchMoving: (isMoving) => set({ isBatchMoving: isMoving }),

  // Edit dialog
  openEditDialog: (document) =>
    set({
      editDialogOpen: true,
      documentToEdit: document,
      editName: document.name,
      editDescription: document.description || '',
      editStatus: document.status || '',
    }),

  closeEditDialog: () =>
    set({
      editDialogOpen: false,
      documentToEdit: null,
      editName: '',
      editDescription: '',
      editStatus: '',
    }),

  updateEditForm: (field, value) =>
    set((_state) => {
      const fieldMap = {
        name: 'editName',
        description: 'editDescription',
        status: 'editStatus',
      } as const
      const stateField = fieldMap[field]
      // name and description should never be null
      if (stateField === 'editStatus') {
        return { [stateField]: value } as Partial<DialogsState>
      }
      return { [stateField]: value ?? '' } as Partial<DialogsState>
    }),

  updateDocumentTextContent: (textContent) =>
    set((state) => ({
      documentToEdit: state.documentToEdit
        ? { ...state.documentToEdit, text_content: textContent }
        : null,
    })),

  // AI check dialogs
  openContentViewDialog: (content) =>
    set({
      contentViewDialogOpen: true,
      documentContent: content,
    }),

  closeContentViewDialog: () =>
    set({
      contentViewDialogOpen: false,
      documentContent: null,
    }),

  openBatchCheckDialog: (documentIds) =>
    set({
      batchCheckDialogOpen: true,
      batchCheckDocumentIds: documentIds,
    }),

  closeBatchCheckDialog: () =>
    set({
      batchCheckDialogOpen: false,
      batchCheckDocumentIds: [],
    }),

  // Folder dialogs
  openAddFolderDialog: () =>
    set({
      addFolderDialogOpen: true,
      editingFolder: null,
      folderFormData: {
        name: '',
        description: '',
        aiNamingPrompt: '',
        aiCheckPrompt: '',
        knowledgeArticleId: null,
      },
    }),

  closeAddFolderDialog: () =>
    set({
      addFolderDialogOpen: false,
      editingFolder: null,
      folderFormData: {
        name: '',
        description: '',
        aiNamingPrompt: '',
        aiCheckPrompt: '',
        knowledgeArticleId: null,
      },
    }),

  openEditFolderDialog: (folder) =>
    set({
      addFolderDialogOpen: true,
      editingFolder: folder,
      folderFormData: {
        name: folder.name,
        description: folder.description || '',
        aiNamingPrompt: folder.ai_naming_prompt || '',
        aiCheckPrompt: folder.ai_check_prompt || '',
        knowledgeArticleId: folder.knowledge_article_id || null,
      },
    }),

  closeEditFolderDialog: () =>
    set({
      addFolderDialogOpen: false,
      editingFolder: null,
      folderFormData: {
        name: '',
        description: '',
        aiNamingPrompt: '',
        aiCheckPrompt: '',
        knowledgeArticleId: null,
      },
    }),

  updateFolderForm: (field, value) =>
    set((state) => ({
      folderFormData: { ...state.folderFormData, [field]: value },
    })),

  resetFolderForm: () =>
    set({
      folderFormData: {
        name: '',
        description: '',
        aiNamingPrompt: '',
        aiCheckPrompt: '',
        knowledgeArticleId: null,
      },
    }),

  openTemplateSelectDialog: () => set({ templateSelectDialogOpen: true }),

  closeTemplateSelectDialog: () =>
    set({
      templateSelectDialogOpen: false,
      selectedTemplateIds: [],
    }),

  setFolderTemplates: (templates) => set({ folderTemplates: templates }),

  setLoadingTemplates: (isLoading) => set({ loadingTemplates: isLoading }),

  toggleTemplateSelection: (templateId) =>
    set((state) => {
      const newSelection = state.selectedTemplateIds.includes(templateId)
        ? state.selectedTemplateIds.filter((id) => id !== templateId)
        : [...state.selectedTemplateIds, templateId]
      return { selectedTemplateIds: newSelection }
    }),

  clearTemplateSelection: () => set({ selectedTemplateIds: [] }),

  // Kit settings dialog
  openKitSettingsDialog: () => set({ kitSettingsDialogOpen: true }),
  closeKitSettingsDialog: () => set({ kitSettingsDialogOpen: false }),
})
