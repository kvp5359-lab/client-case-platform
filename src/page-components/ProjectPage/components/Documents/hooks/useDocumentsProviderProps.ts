"use client"

/**
 * Сборка props для <DocumentsProvider>. Вынесена из DocumentsTabContent,
 * чтобы не раздувать оркестратор: сам хук не содержит бизнес-логики —
 * только форматирует вход контекста из уже готовых подхуков.
 */

import { useMemo } from 'react'
import type { DocumentsProviderProps } from '../DocumentsContext'
import type { DocumentStatus } from '@/components/documents/types'
import type { useDocumentsDocumentActions } from './useDocumentsDocumentActions'
import type { useDocumentsFileUpload } from './useDocumentsFileUpload'
import type { useDocumentsDragDrop } from './useDocumentsDragDrop'
import type { useSourceDocumentDrop } from './useSourceDocumentDrop'
import type { useMessengerAttachmentDrop } from './useMessengerAttachmentDrop'
import type { useCompressAnalysis } from './useCompressAnalysis'

type DocActions = ReturnType<typeof useDocumentsDocumentActions>
type FileUpload = ReturnType<typeof useDocumentsFileUpload>
type DragDrop = ReturnType<typeof useDocumentsDragDrop>
type SourceDrop = ReturnType<typeof useSourceDocumentDrop>
type MessengerDrop = ReturnType<typeof useMessengerAttachmentDrop>
type CompressAnalysis = ReturnType<typeof useCompressAnalysis>

interface UseDocumentsProviderPropsParams {
  projectId: string
  workspaceId: string
  statuses: DocumentStatus[]
  compressingDocIds: Set<string>
  compressAnalysis: CompressAnalysis
  fileUpload: FileUpload
  docActions: DocActions
  dragDrop: DragDrop
  sourceDrop: SourceDrop
  messengerDrop: MessengerDrop
  selectedDocuments: Set<string>
  hasSelection: boolean
  onSelectDocument: (docId: string, event?: React.MouseEvent) => void
  handleOpenEditDialog: (docId: string) => void
  handleMoveDocument: (docId: string) => void
  handleDuplicateDocument: (docId: string) => void
  handleSlotUnlink: (slotId: string) => void
}

export function useDocumentsProviderProps({
  projectId,
  workspaceId,
  statuses,
  compressingDocIds,
  compressAnalysis,
  fileUpload,
  docActions,
  dragDrop,
  sourceDrop,
  messengerDrop,
  selectedDocuments,
  hasSelection,
  onSelectDocument,
  handleOpenEditDialog,
  handleMoveDocument,
  handleDuplicateDocument,
  handleSlotUnlink,
}: UseDocumentsProviderPropsParams): Omit<DocumentsProviderProps, 'children'> {
  return useMemo(
    () => ({
      projectId,
      workspaceId,
      statuses,
      compressingDocIds,
      uploadingSlotId: fileUpload.uploadingSlotId,
      highlightedCompressDocIds: compressAnalysis.highlightedCompressDocIds,
      selectedDocuments,
      hasSelection,
      onSelectDocument,
      onStatusChange: docActions.handleStatusChange,
      onOpenEdit: handleOpenEditDialog,
      onOpenDocument: docActions.handleOpenDocumentById,
      onDownloadDocument: docActions.handleDownloadDocument,
      onDeleteDocument: docActions.handleDeleteDocument,
      onCompressDocument: docActions.handleCompressDocument,
      onMoveDocument: handleMoveDocument,
      onDuplicateDocument: handleDuplicateDocument,
      onSlotUnlink: handleSlotUnlink,
      onSourceDocDrop: sourceDrop.handleSourceDocDrop,
      onSourceDocSlotDrop: sourceDrop.handleSourceDocSlotDrop,
      onMessengerAttachmentDrop: messengerDrop.handleMessengerAttachmentDrop,
      onMessengerAttachmentSlotDrop: messengerDrop.handleMessengerAttachmentSlotDrop,
      sourceUploadFolderId: sourceDrop.sourceUploadFolderId,
      sourceUploadPhase: sourceDrop.sourceUploadPhase,
      sourceUploadTargetDocId: sourceDrop.sourceUploadTargetDocId,
      sourceUploadTargetPosition: sourceDrop.sourceUploadTargetPosition,
      draggedDocId: dragDrop.draggedDocId,
      dragOverDocId: dragDrop.dragOverDocId,
      dragOverPosition: dragDrop.dragOverPosition,
      dragOverFolderId: dragDrop.dragOverFolderId,
      onDocDragStart: dragDrop.onDocDragStart,
      onDocDragOver: dragDrop.onDocDragOver,
      onDocDragLeave: dragDrop.onDocDragLeave,
      onDocDragEnd: dragDrop.onDocDragEnd,
      onDocDrop: dragDrop.onDocDrop,
      onFolderDragOver: dragDrop.onFolderDragOver,
      onFolderDragLeave: dragDrop.onFolderDragLeave,
      onFolderDrop: dragDrop.onFolderDrop,
    }),
    [
      projectId,
      workspaceId,
      statuses,
      compressingDocIds,
      compressAnalysis.highlightedCompressDocIds,
      fileUpload.uploadingSlotId,
      docActions,
      dragDrop,
      sourceDrop,
      messengerDrop,
      selectedDocuments,
      hasSelection,
      onSelectDocument,
      handleOpenEditDialog,
      handleMoveDocument,
      handleDuplicateDocument,
      handleSlotUnlink,
    ],
  )
}
