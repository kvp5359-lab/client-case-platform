"use client"

/**
 * Context для CardView — устраняет prop drilling через FolderCard/DocumentItem/SlotItem.
 * Содержит общие данные (projectId, statuses) и document handlers.
 */

import { createContext, useContext, useMemo } from 'react'
import type { DocumentStatus } from '@/components/documents/types'

interface CardViewContextValue {
  projectId?: string
  workspaceId?: string
  statuses: DocumentStatus[]
  compressingDocId: string | null
  uploadingSlotId: string | null
  // Document handlers
  onStatusChange: (docId: string, status: string | null) => void
  onOpenEdit: (docId: string) => void
  onOpenDocument: (docId: string) => void
  onDownloadDocument: (docId: string) => void
  onDeleteDocument: (docId: string) => void
  onCompressDocument: (docId: string) => void
  onMoveDocument: (docId: string) => void
  onCreateTask: (docId: string) => void
  onSlotUnlink: (slotId: string) => void
}

const CardViewContext = createContext<CardViewContextValue | null>(null)

export function useCardViewContext() {
  const ctx = useContext(CardViewContext)
  if (!ctx) throw new Error('useCardViewContext must be used within CardViewProvider')
  return ctx
}

interface CardViewProviderProps {
  children: React.ReactNode
  projectId?: string
  workspaceId?: string
  statuses: DocumentStatus[]
  compressingDocId: string | null
  uploadingSlotId: string | null
  onStatusChange: (docId: string, status: string | null) => void
  onOpenEdit: (docId: string) => void
  onOpenDocument: (docId: string) => void
  onDownloadDocument: (docId: string) => void
  onDeleteDocument: (docId: string) => void
  onCompressDocument: (docId: string) => void
  onMoveDocument: (docId: string) => void
  onCreateTask: (docId: string) => void
  onSlotUnlink: (slotId: string) => void
}

export function CardViewProvider({
  children,
  projectId,
  workspaceId,
  statuses,
  compressingDocId,
  uploadingSlotId,
  onStatusChange,
  onOpenEdit,
  onOpenDocument,
  onDownloadDocument,
  onDeleteDocument,
  onCompressDocument,
  onMoveDocument,
  onCreateTask,
  onSlotUnlink,
}: CardViewProviderProps) {
  const value = useMemo<CardViewContextValue>(
    () => ({
      projectId,
      workspaceId,
      statuses,
      compressingDocId,
      uploadingSlotId,
      onStatusChange,
      onOpenEdit,
      onOpenDocument,
      onDownloadDocument,
      onDeleteDocument,
      onCompressDocument,
      onMoveDocument,
      onCreateTask,
      onSlotUnlink,
    }),
    [
      projectId,
      workspaceId,
      statuses,
      compressingDocId,
      uploadingSlotId,
      onStatusChange,
      onOpenEdit,
      onOpenDocument,
      onDownloadDocument,
      onDeleteDocument,
      onCompressDocument,
      onMoveDocument,
      onCreateTask,
      onSlotUnlink,
    ],
  )

  return <CardViewContext.Provider value={value}>{children}</CardViewContext.Provider>
}
