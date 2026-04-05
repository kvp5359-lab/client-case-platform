"use client"

/**
 * Типы для useDocumentKitHandlers — входные пропсы и возвращаемый интерфейс
 */

import React from 'react'
import type { DocumentWithFiles, SourceDocument, SourceDocumentInfo, Folder } from '@/components/documents/types'
import type { DocumentKitWithDocuments } from '@/services/api/documentKitService'
import type { Tables } from '@/types/database'
import type { ConfirmDialogState } from '@/hooks/dialogs/useConfirmDialog'

// Тип для callback установки boolean состояния
export type SetBooleanState = (value: boolean) => void

// Тип для callback установки string состояния
export type SetStringState = (value: string) => void

// Тип для upload функции
export type UploadDocumentFn = (params: {
  file: File
  documentKitId: string
  projectId: string
  workspaceId: string
  documentName?: string
  documentDescription?: string
  folderId?: string | null
  sourceDocumentId?: string | null
}) => Promise<{ document: Tables<'documents'>; fileId: string }>

export interface UseDocumentKitHandlersProps {
  kit: DocumentKitWithDocuments | undefined
  projectId: string

  // Операции с документами
  documentOps: {
    handleSoftDelete: (documentId: string) => Promise<void>
    handleHardDelete: (documentId: string) => Promise<void>
    handleRestore: (documentId: string) => Promise<void>
    handleOpen: (documentId: string) => void
    handleDownload: (documentId: string) => Promise<void>
    handleStatusChange: (
      documentId: string,
      newStatus: string | null,
      onClose?: () => void,
    ) => Promise<void>
    handleMove: (documentId: string, folderId: string | null, onClose?: () => void) => Promise<void>
    isMoving: boolean
  }

  // Редактирование
  documentEdit: {
    handleOpenEditDialog: (documentId: string, kit: DocumentKitWithDocuments | undefined) => void
  }

  // Папки
  folderOps: {
    handleAddDocumentClick: () => void
    handleFolderDocumentsClick: (folderId: string) => void
    handleFileChange: (
      event: React.ChangeEvent<HTMLInputElement>,
      kit: DocumentKitWithDocuments | undefined,
      uploadDocument: UploadDocumentFn,
    ) => Promise<void>
    loadFolderTemplates: (kit: DocumentKitWithDocuments | undefined) => Promise<void>
    handleToggleTemplateSelection: (templateId: string) => void
    handleCreateFoldersFromTemplates: (kit: DocumentKitWithDocuments | undefined) => Promise<void>
    handleSaveFolder: (kit: DocumentKitWithDocuments | undefined) => Promise<void>
    handleEditFolder: (folder: Folder) => void
    toggleFolder: (folderId: string) => void
  }

  // Слияние
  documentMerge: {
    handleOpenMergeDialog: (
      kit: DocumentKitWithDocuments | undefined,
      selectedDocuments: Set<string>,
    ) => void
    handleMergeDocuments: (params: {
      documentKitId: string
      allDocuments: DocumentWithFiles[]
    }) => Promise<void>
    generateMergeNameWithAI: (documents: { name: string }[]) => Promise<void>
    handleRemoveFromMerge: (docId: string) => void
    handleDragStart: (index: number) => void
    handleDragOver: (e: React.DragEvent, index: number) => void
    handleDragEnd: () => void
  }

  // Пакетные операции
  batchOps: {
    handleBatchDelete: (selectedDocuments: Set<string>) => Promise<void>
    handleBatchHardDelete: (selectedDocuments: Set<string>) => Promise<void>
    handleBatchCheck: (
      selectedDocuments: Set<string>,
      documents: DocumentWithFiles[] | undefined,
      setCheckingBatch: SetBooleanState,
    ) => Promise<void>
    handleBatchDownload: (
      selectedDocuments: Set<string>,
      documents: DocumentWithFiles[] | undefined,
      folders: Folder[],
    ) => Promise<void>
  }

  // Сжатие
  compressOps: {
    handleBatchCompress: (
      selectedDocuments: Set<string>,
      documents: DocumentWithFiles[] | undefined,
    ) => Promise<void>
    handleCompressSingleDocument: (
      documentId: string,
      documents: DocumentWithFiles[] | undefined,
    ) => Promise<void>
  }

  // Экспорт
  exportOps: {
    handleExportToGoogleDrive: (
      folderLink: string,
      syncMode: 'replace_all' | 'add_only' | 'replace_existing',
      selectedDocuments: Set<string>,
      documents: DocumentWithFiles[] | undefined,
      folders: Folder[],
      setExporting: SetBooleanState,
      setFolderLink: SetStringState,
      closeDialog: () => void,
    ) => Promise<void>
  }

  // Исходные документы
  sourceOps: {
    loadSourceDocuments: () => Promise<void>
    toggleSourceDocumentHidden: (fileId: string, isHidden: boolean) => Promise<void>
    handleToggleFolderHidden: (folderName: string, hide: boolean) => Promise<void>
    handleDownloadSourceDocument: (file: SourceDocument) => Promise<void>
    handleSyncSource: () => Promise<void>
  }

  sourceUpload: {
    uploadSourceDocument: (
      file: SourceDocumentInfo,
      folderId: string | null,
      showToast?: boolean,
      onPhaseChange?: (phase: 'downloading' | 'uploading' | null) => void,
    ) => Promise<string | null>
    uploadSourceDocumentSilent: (
      file: SourceDocumentInfo,
      folderId: string | null,
    ) => Promise<string | null>
    uploadSourceDocumentForSlot?: unknown
  }

  // Перемещение
  batchMoveOps: {
    handleBatchMove: (
      kit: DocumentKitWithDocuments | undefined,
      selectedDocuments: Set<string>,
      targetFolderId: string | null,
      setBatchMoving: SetBooleanState,
    ) => Promise<void>
    handleDocumentDrop: (
      kit: DocumentKitWithDocuments | undefined,
      draggedDocId: string | null,
      targetDoc: DocumentWithFiles,
      position: 'top' | 'bottom' | null,
      resetDragState: () => void,
    ) => Promise<void>
    handleFolderDrop: (
      kit: DocumentKitWithDocuments | undefined,
      draggedDocId: string | null,
      targetFolderId: string | null,
      resetDragState: () => void,
    ) => Promise<void>
  }

  // Подключение источника
  sourceConnection: {
    connectSource: (
      folderLink: string,
      callbacks: {
        closeDialog: () => void
        setSourceFolderLink: SetStringState
        setSourceConnected: SetBooleanState
      },
    ) => Promise<boolean>
    saveSourceSettings: (
      folderLink: string,
      callbacks: { closeDialog: () => void; setSourceConnected: SetBooleanState },
    ) => Promise<boolean>
    saveExportSettings: (
      folderLink: string,
      callbacks: { closeDialog: () => void; setExportFolderConnected: SetBooleanState },
    ) => Promise<boolean>
  }

  // Дополнительные зависимости
  uploadDocument: UploadDocumentFn
  deleteDocumentKit: (kitId: string) => Promise<void>
  selectedDocuments: Set<string>
  clearSelection: () => void
  resetDragState: () => void
  draggedDocId: string | null
  dragOverPosition: 'top' | 'bottom' | null
  draggedSourceDoc: SourceDocument | null
  setExportFolderConnected: SetBooleanState
}

/**
 * Тип содержимого latestRef в useDocumentKitHandlers.
 * Используется в useDocumentKitBatchHandlers и useDocumentKitDragDropHandlers
 * для избежания any.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LatestHandlersRef = React.RefObject<Record<string, any>>

export interface DocumentKitHandlers {
  // Документы
  handleOpenEditDialog: (documentId: string) => void
  handleUpdateStatus: (documentId: string, newStatus: string | null) => Promise<void>
  handleMoveDocument: (folderId: string | null) => Promise<void>
  handleMoveSourceDocumentToFolder: (folderId: string | null) => Promise<void>
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  handleDelete: () => Promise<void>

  // Drag & Drop
  handleDocDrop: (e: React.DragEvent, targetDoc: DocumentWithFiles) => Promise<void>
  handleFolderDrop: (e: React.DragEvent, targetFolderId: string | null) => Promise<void>

  // Пакетные операции
  handleBatchDelete: () => void
  handleBatchHardDelete: () => void
  handleBatchCheck: () => void
  handleBatchDownload: () => void
  handleBatchCompress: () => void
  handleCompressSingleDocument: (documentId: string) => void
  handleBatchExportToDisk: () => void
  handleExportToGoogleDrive: () => void
  handleBatchMove: (targetFolderId: string | null) => Promise<void>
  handleBatchSetStatus: (statusId: string | null) => Promise<void>

  // Слияние
  handleOpenMergeDialog: () => void
  handleMergeDocuments: () => void
  handleGenerateMergeName: () => void

  // Источник
  handleConnectSource: () => Promise<void>
  handleSaveSourceSettings: () => Promise<void>
  handleSaveExportSettings: () => Promise<void>

  // Диалог подтверждения
  confirmDialogProps: {
    state: ConfirmDialogState
    onConfirm: () => void
    onCancel: () => void
  }
}
