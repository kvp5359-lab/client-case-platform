"use client"

/**
 * Z5-01: Вынесенные из DocumentsTabContent диалоговые операции
 * Move document, batch move source, create task, slot unlink, merge
 */

import { useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { useDialog } from '@/hooks/shared/useDialog'
import { clearAllSelections, useGlobalSelectedIds } from '@/hooks/documents/useDocumentSelection'
import { useGlobalBatchActions } from '@/hooks/documents/useGlobalBatchActions'
import { useDocumentEdit } from '@/components/projects/DocumentKitsTab/hooks/useDocumentEdit'
import { useDocumentVerify } from '@/components/projects/DocumentKitsTab/hooks/useDocumentVerify'
import { useDocumentMerge } from '@/components/projects/DocumentKitsTab/hooks/useDocumentMerge'
import { useDocumentSummary } from '@/hooks/documents/useDocumentSummary'
import type { DocumentKitWithDocuments } from '@/components/documents/types'
import type { SourceDocument } from '@/components/documents'
import type { FolderSlotWithDocument as FolderSlot } from '@/components/documents/types'
import type { UploadDocumentFn, SoftDeleteDocumentFn } from '@/hooks/useDocuments.types'
import type { useSourceDocumentDrop } from './useSourceDocumentDrop'

interface UseDocumentsDialogActionsProps {
  projectId: string
  workspaceId: string
  documentKits: DocumentKitWithDocuments[]
  folderSlots: FolderSlot[]
  folderStatuses: { id: string; name: string; color: string }[]
  moveDocument: (params: { documentId: string; folderId: string | null }) => Promise<void>
  duplicateDocument: (params: { documentId: string; folderId: string | null }) => Promise<string>
  uploadDocument: UploadDocumentFn
  softDeleteDocument: SoftDeleteDocumentFn
  sourceDocuments: SourceDocument[]
  toggleSourceDocHidden?: (sourceDocId: string, currentHidden: boolean) => Promise<void>
  sourceDrop: ReturnType<typeof useSourceDocumentDrop>
  invalidateDocumentKits: () => Promise<void>
  unlinkSlot: (slotId: string) => Promise<void>
  docActions: {
    getKit: (docId: string) => DocumentKitWithDocuments | undefined
    handleOpenDocumentById: (docId: string) => Promise<void>
  }
}

export function useDocumentsDialogActions({
  projectId,
  workspaceId,
  documentKits,
  folderSlots,
  folderStatuses,
  moveDocument,
  duplicateDocument,
  uploadDocument,
  softDeleteDocument,
  sourceDocuments,
  toggleSourceDocHidden,
  sourceDrop,
  invalidateDocumentKits,
  unlinkSlot,
  docActions,
}: UseDocumentsDialogActionsProps) {
  // Move document
  const [moveDocId, setMoveDocId] = useState<string | null>(null)
  const moveDialog = useDialog()
  const handleMoveDocument = useCallback(
    (docId: string) => {
      setMoveDocId(docId)
      moveDialog.open()
    },
    [moveDialog],
  )
  const allFolders = useMemo(
    () =>
      documentKits.flatMap((kit) => kit.folders?.map((f) => ({ id: f.id, name: f.name })) || []),
    [documentKits],
  )
  const folderGroups = useMemo(
    () =>
      documentKits
        .filter((kit) => kit.folders && kit.folders.length > 0)
        .map((kit) => ({
          kitId: kit.id,
          kitName: kit.name,
          folders: kit.folders!.map((f) => ({ id: f.id, name: f.name })),
        })),
    [documentKits],
  )
  const handleMoveToFolder = useCallback(
    async (folderId: string | null) => {
      if (!moveDocId) return
      try {
        await moveDocument({ documentId: moveDocId, folderId })
        moveDialog.close()
        toast.success('Документ перемещён')
      } catch {
        toast.error('Не удалось переместить документ')
      }
    },
    [moveDocId, moveDocument, moveDialog],
  )

  // Duplicate document
  const [duplicateDocId, setDuplicateDocId] = useState<string | null>(null)
  const duplicateDialog = useDialog()
  const handleDuplicateDocument = useCallback(
    (docId: string) => {
      setDuplicateDocId(docId)
      duplicateDialog.open()
    },
    [duplicateDialog],
  )
  const handleDuplicateToFolder = useCallback(
    async (folderId: string | null) => {
      if (!duplicateDocId) return
      try {
        await duplicateDocument({ documentId: duplicateDocId, folderId })
        duplicateDialog.close()
        toast.success('Документ продублирован')
      } catch {
        toast.error('Не удалось продублировать документ')
      }
    },
    [duplicateDocId, duplicateDocument, duplicateDialog],
  )

  // Batch move source documents
  const globalSelectedIds = useGlobalSelectedIds()
  const handleBatchMoveSource = useCallback(
    async (folderId: string | null) => {
      const selected = sourceDocuments.filter((d) => globalSelectedIds.has(d.id))
      if (selected.length === 0) return
      const count = selected.length
      const toastId = toast.loading(`Перемещение: 0/${count}...`)
      let moved = 0
      let errors = 0
      for (const doc of selected) {
        try {
          await sourceDrop.sourceUpload.uploadSourceDocument(doc, folderId, false)
          moved++
        } catch {
          errors++
        }
        toast.loading(`Перемещение: ${moved + errors}/${count}...`, { id: toastId })
      }
      toast.dismiss(toastId)
      clearAllSelections()
      await invalidateDocumentKits()
      await sourceDrop.loadSourceDocuments()
      if (errors > 0) toast.warning(`Перемещено ${moved} из ${count}`)
      else toast.success(`${moved} документов перемещено`)
    },
    [sourceDocuments, globalSelectedIds, sourceDrop, invalidateDocumentKits],
  )

  const handleToggleSourceDocHidden = useCallback(
    async (sourceDocId: string, currentHidden: boolean) => {
      if (toggleSourceDocHidden) {
        await toggleSourceDocHidden(sourceDocId, currentHidden)
      }
    },
    [toggleSourceDocHidden],
  )

  const batchActions = useGlobalBatchActions({
    projectId,
    workspaceId,
    sourceDocuments,
    onBatchMoveSource: handleBatchMoveSource,
    onToggleSourceDocHidden: toggleSourceDocHidden ? handleToggleSourceDocHidden : undefined,
    onAfterBatchToggle: sourceDrop.loadSourceDocuments,
  })

  // Slot unlink
  const handleSlotUnlink = useCallback(
    async (slotId: string) => {
      try {
        await unlinkSlot(slotId)
        toast.success('Документ откреплён от слота')
      } catch {
        toast.error('Не удалось открепить документ')
      }
    },
    [unlinkSlot],
  )

  // Document edit & verify & merge
  const documentEdit = useDocumentEdit(projectId, invalidateDocumentKits)
  const documentVerify = useDocumentVerify(projectId, invalidateDocumentKits)
  const documentMerge = useDocumentMerge(
    projectId,
    workspaceId,
    () => invalidateDocumentKits(),
    uploadDocument,
    softDeleteDocument,
    () => clearAllSelections(),
  )

  const handleOpenEditDialog = useCallback(
    (docId: string) => {
      documentEdit.handleOpenEditDialog(docId, docActions.getKit(docId))
    },
    [docActions, documentEdit],
  )

  // Summary
  const summary = useDocumentSummary({
    folderSlots,
    folderStatuses: folderStatuses as unknown as import('@/types/entities').DocumentStatus[],
    workspaceId,
  })

  return {
    // Move
    moveDialog,
    moveDocId,
    allFolders,
    folderGroups,
    handleMoveDocument,
    handleMoveToFolder,
    // Duplicate
    duplicateDialog,
    duplicateDocId,
    handleDuplicateDocument,
    handleDuplicateToFolder,
    // Batch
    batchActions,
    // Slot unlink
    handleSlotUnlink,
    // Edit / Verify / Merge
    documentEdit,
    documentVerify,
    documentMerge,
    handleOpenEditDialog,
    // Summary
    summary,
  }
}
