"use client"

import type { ComponentProps } from 'react'
import { EditDocumentDialog } from '@/components/projects/DocumentKitsTab/dialogs/EditDocumentDialog'
import { ContentViewDialog } from '@/components/projects/DocumentKitsTab/dialogs/ContentViewDialog'
import { MergeDocumentsDialog } from '@/components/projects/DocumentKitsTab/dialogs/MergeDocumentsDialog'
import { DeleteKitDialog } from '@/components/projects/DocumentKitsTab/dialogs/DeleteKitDialog'
import { SummaryDialog } from '@/components/documents'
import { MoveDocumentDialog } from '@/components/documents'
import { DownloadDocumentsDialog } from '@/components/documents/DownloadDocumentsDialog'
import { FloatingBatchActions } from '@/components/documents/FloatingBatchActions'
import { CompressAnalysisDialog } from '@/components/documents/dialogs/CompressAnalysisDialog'
import { FolderDialog } from '@/components/documents/dialogs/FolderDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { HiddenFileInputs } from './HiddenFileInputs'

interface DocumentsDialogsProps {
  editDocumentDialog: ComponentProps<typeof EditDocumentDialog>
  contentViewDialog: ComponentProps<typeof ContentViewDialog>
  hiddenFileInputs: ComponentProps<typeof HiddenFileInputs>
  summaryDialog: ComponentProps<typeof SummaryDialog>
  moveDocumentDialog: ComponentProps<typeof MoveDocumentDialog>
  duplicateDocumentDialog: ComponentProps<typeof MoveDocumentDialog>
  mergeDocumentsDialog: ComponentProps<typeof MergeDocumentsDialog>
  folderDialog: ComponentProps<typeof FolderDialog>
  deleteKitDialog: ComponentProps<typeof DeleteKitDialog>
  docActionsConfirm: ComponentProps<typeof ConfirmDialog>
  deleteFolderConfirm: ComponentProps<typeof ConfirmDialog>
  syncKitConfirm: ComponentProps<typeof ConfirmDialog>
  mergeConfirm: ComponentProps<typeof ConfirmDialog>
  batchDeleteConfirm: ComponentProps<typeof ConfirmDialog>
  batchHardDeleteConfirm: ComponentProps<typeof ConfirmDialog>
  batchActionsProps: ComponentProps<typeof FloatingBatchActions>
  batchDownloadDialog: ComponentProps<typeof DownloadDocumentsDialog>
  kitDownloadDialog: ComponentProps<typeof DownloadDocumentsDialog>
  compressAnalysisDialog: ComponentProps<typeof CompressAnalysisDialog>
}

export function DocumentsDialogs({
  editDocumentDialog,
  contentViewDialog,
  hiddenFileInputs,
  summaryDialog,
  moveDocumentDialog,
  duplicateDocumentDialog,
  mergeDocumentsDialog,
  folderDialog,
  deleteKitDialog,
  docActionsConfirm,
  deleteFolderConfirm,
  syncKitConfirm,
  mergeConfirm,
  batchDeleteConfirm,
  batchHardDeleteConfirm,
  batchActionsProps,
  batchDownloadDialog,
  kitDownloadDialog,
  compressAnalysisDialog,
}: DocumentsDialogsProps) {
  return (
    <>
      <EditDocumentDialog {...editDocumentDialog} />
      <ContentViewDialog {...contentViewDialog} />
      <HiddenFileInputs {...hiddenFileInputs} />
      <SummaryDialog {...summaryDialog} />
      <MoveDocumentDialog {...moveDocumentDialog} />
      <MoveDocumentDialog {...duplicateDocumentDialog} />
      <MergeDocumentsDialog {...mergeDocumentsDialog} />
      <FolderDialog {...folderDialog} />
      <DeleteKitDialog {...deleteKitDialog} />
      <ConfirmDialog {...docActionsConfirm} />
      <ConfirmDialog {...deleteFolderConfirm} />
      <ConfirmDialog {...syncKitConfirm} />
      <ConfirmDialog {...mergeConfirm} />
      <FloatingBatchActions {...batchActionsProps} />
      <ConfirmDialog {...batchDeleteConfirm} />
      <ConfirmDialog {...batchHardDeleteConfirm} />
      <DownloadDocumentsDialog {...batchDownloadDialog} />
      <DownloadDocumentsDialog {...kitDownloadDialog} />
      <CompressAnalysisDialog {...compressAnalysisDialog} />
    </>
  )
}
