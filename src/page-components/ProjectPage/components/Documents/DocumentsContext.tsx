"use client"

/**
 * Context для Documents — устраняет prop drilling через FolderCard/DocumentItem/SlotItem.
 * Содержит общие данные (projectId, statuses) и document handlers.
 */

import { createContext, useContext, useMemo } from 'react'
import type { DocumentStatus } from '@/components/documents/types'

interface DocumentsContextValue {
  projectId?: string
  workspaceId?: string
  statuses: DocumentStatus[]
  compressingDocIds: Set<string>
  uploadingSlotId: string | null
  highlightedCompressDocIds: Set<string>
  // Selection
  selectedDocuments: Set<string>
  hasSelection: boolean
  onSelectDocument: (docId: string, event?: React.MouseEvent) => void
  // Document handlers
  onStatusChange: (docId: string, status: string | null) => void
  onOpenEdit: (docId: string) => void
  onOpenDocument: (docId: string) => void
  onDownloadDocument: (docId: string) => void
  onDeleteDocument: (docId: string) => void
  onCompressDocument: (docId: string) => void
  onMoveDocument: (docId: string) => void
  onDuplicateDocument: (docId: string) => void
  onSlotUnlink: (slotId: string) => void
  // Source doc drag & drop
  onSourceDocDrop: (
    sourceDocJson: string,
    folderId: string | null,
    targetDocId?: string,
    position?: 'top' | 'bottom',
  ) => void
  onSourceDocSlotDrop: (sourceDocJson: string, slotId: string, folderId: string) => void
  // Messenger attachment drag & drop
  onMessengerAttachmentDrop: (
    attachmentJson: string,
    folderId: string | null,
    targetDocId?: string,
    position?: 'top' | 'bottom',
  ) => void
  onMessengerAttachmentSlotDrop: (attachmentJson: string, slotId: string, folderId: string) => void
  sourceUploadFolderId: string | null
  sourceUploadPhase: 'downloading' | 'uploading' | null
  sourceUploadTargetDocId: string | null
  sourceUploadTargetPosition: 'top' | 'bottom'
  // Document drag & drop between folders
  draggedDocId: string | null
  dragOverDocId: string | null
  dragOverPosition: 'top' | 'bottom'
  dragOverFolderId: string | null
  onDocDragStart: (e: React.DragEvent, docId: string) => void
  onDocDragOver: (e: React.DragEvent, targetDocId: string) => void
  onDocDragLeave: () => void
  onDocDragEnd: () => void
  onDocDrop: (
    e: React.DragEvent,
    targetDoc: import('@/components/documents/types').DocumentWithFiles,
  ) => void
  onFolderDragOver: (e: React.DragEvent, folderId: string) => void
  onFolderDragLeave: (e: React.DragEvent) => void
  onFolderDrop: (e: React.DragEvent, folderId: string) => void
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null)

export function useDocumentsContext() {
  const ctx = useContext(DocumentsContext)
  if (!ctx) throw new Error('useDocumentsContext must be used within DocumentsProvider')
  return ctx
}

export interface DocumentsProviderProps {
  children: React.ReactNode
  projectId?: string
  workspaceId?: string
  statuses: DocumentStatus[]
  compressingDocIds: Set<string>
  uploadingSlotId: string | null
  highlightedCompressDocIds: Set<string>
  selectedDocuments: Set<string>
  hasSelection: boolean
  onSelectDocument: (docId: string, event?: React.MouseEvent) => void
  onStatusChange: (docId: string, status: string | null) => void
  onOpenEdit: (docId: string) => void
  onOpenDocument: (docId: string) => void
  onDownloadDocument: (docId: string) => void
  onDeleteDocument: (docId: string) => void
  onCompressDocument: (docId: string) => void
  onMoveDocument: (docId: string) => void
  onDuplicateDocument: (docId: string) => void
  onSlotUnlink: (slotId: string) => void
  onSourceDocDrop: (
    sourceDocJson: string,
    folderId: string | null,
    targetDocId?: string,
    position?: 'top' | 'bottom',
  ) => void
  onSourceDocSlotDrop: (sourceDocJson: string, slotId: string, folderId: string) => void
  onMessengerAttachmentDrop: (
    attachmentJson: string,
    folderId: string | null,
    targetDocId?: string,
    position?: 'top' | 'bottom',
  ) => void
  onMessengerAttachmentSlotDrop: (attachmentJson: string, slotId: string, folderId: string) => void
  sourceUploadFolderId: string | null
  sourceUploadPhase: 'downloading' | 'uploading' | null
  sourceUploadTargetDocId: string | null
  sourceUploadTargetPosition: 'top' | 'bottom'
  // Document drag & drop
  draggedDocId: string | null
  dragOverDocId: string | null
  dragOverPosition: 'top' | 'bottom'
  dragOverFolderId: string | null
  onDocDragStart: (e: React.DragEvent, docId: string) => void
  onDocDragOver: (e: React.DragEvent, targetDocId: string) => void
  onDocDragLeave: () => void
  onDocDragEnd: () => void
  onDocDrop: (
    e: React.DragEvent,
    targetDoc: import('@/components/documents/types').DocumentWithFiles,
  ) => void
  onFolderDragOver: (e: React.DragEvent, folderId: string) => void
  onFolderDragLeave: (e: React.DragEvent) => void
  onFolderDrop: (e: React.DragEvent, folderId: string) => void
}

export function DocumentsProvider({
  children,
  projectId,
  workspaceId,
  statuses,
  compressingDocIds,
  uploadingSlotId,
  highlightedCompressDocIds,
  selectedDocuments,
  hasSelection,
  onSelectDocument,
  onStatusChange,
  onOpenEdit,
  onOpenDocument,
  onDownloadDocument,
  onDeleteDocument,
  onCompressDocument,
  onMoveDocument,
  onDuplicateDocument,
  onSlotUnlink,
  onSourceDocDrop,
  onSourceDocSlotDrop,
  onMessengerAttachmentDrop,
  onMessengerAttachmentSlotDrop,
  sourceUploadFolderId,
  sourceUploadPhase,
  sourceUploadTargetDocId,
  sourceUploadTargetPosition,
  draggedDocId,
  dragOverDocId,
  dragOverPosition,
  dragOverFolderId,
  onDocDragStart,
  onDocDragOver,
  onDocDragLeave,
  onDocDragEnd,
  onDocDrop,
  onFolderDragOver,
  onFolderDragLeave,
  onFolderDrop,
}: DocumentsProviderProps) {
  const value = useMemo<DocumentsContextValue>(
    () => ({
      projectId,
      workspaceId,
      statuses,
      compressingDocIds,
      uploadingSlotId,
      highlightedCompressDocIds,
      selectedDocuments,
      hasSelection,
      onSelectDocument,
      onStatusChange,
      onOpenEdit,
      onOpenDocument,
      onDownloadDocument,
      onDeleteDocument,
      onCompressDocument,
      onMoveDocument,
      onDuplicateDocument,
      onSlotUnlink,
      onSourceDocDrop,
      onSourceDocSlotDrop,
      onMessengerAttachmentDrop,
      onMessengerAttachmentSlotDrop,
      sourceUploadFolderId,
      sourceUploadPhase,
      sourceUploadTargetDocId,
      sourceUploadTargetPosition,
      draggedDocId,
      dragOverDocId,
      dragOverPosition,
      dragOverFolderId,
      onDocDragStart,
      onDocDragOver,
      onDocDragLeave,
      onDocDragEnd,
      onDocDrop,
      onFolderDragOver,
      onFolderDragLeave,
      onFolderDrop,
    }),
    [
      projectId,
      workspaceId,
      statuses,
      compressingDocIds,
      uploadingSlotId,
      highlightedCompressDocIds,
      selectedDocuments,
      hasSelection,
      onSelectDocument,
      onStatusChange,
      onOpenEdit,
      onOpenDocument,
      onDownloadDocument,
      onDeleteDocument,
      onCompressDocument,
      onMoveDocument,
      onDuplicateDocument,
      onSlotUnlink,
      onSourceDocDrop,
      onSourceDocSlotDrop,
      onMessengerAttachmentDrop,
      onMessengerAttachmentSlotDrop,
      sourceUploadFolderId,
      sourceUploadPhase,
      sourceUploadTargetDocId,
      sourceUploadTargetPosition,
      draggedDocId,
      dragOverDocId,
      dragOverPosition,
      dragOverFolderId,
      onDocDragStart,
      onDocDragOver,
      onDocDragLeave,
      onDocDragEnd,
      onDocDrop,
      onFolderDragOver,
      onFolderDragLeave,
      onFolderDrop,
    ],
  )

  return <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>
}
