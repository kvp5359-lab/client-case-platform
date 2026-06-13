"use client"

/**
 * Лёгкий провайдер для переиспользования настоящего SlotItem (и DocumentItem)
 * из вкладки «Документы» внутри плана — БЕЗ поднятия всего движка документов.
 *
 * Загрузка в слот самодостаточна (скрытый file-input → upload → fillSlot, без
 * диалогов), поэтому здесь:
 * - реальные: статус загрузки (uploadingSlotId), upload по клику (handleSlotClick),
 *   переименование/отвязка слота;
 * - no-op: тяжёлые действия над документами (edit/move/compress/dnd) — их полный
 *   набор живёт только в DocumentsTabContent. Заполненный слот при этом
 *   отображается идентично (DocumentItem), но расширенные действия в плане
 *   ограничены (см. backlog).
 *
 * Вкладка «Документы» не трогается — нулевой риск регрессий там.
 */

import { createContext, useCallback, useContext, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DocumentsProvider } from '@/components/documents/Documents/DocumentsContext'
import { HiddenFileInputs } from '@/components/documents/Documents/HiddenFileInputs'
import { useDocumentsFileUpload } from '@/components/documents/Documents/hooks/useDocumentsFileUpload'
import { useDocuments } from '@/hooks/documents/useDocuments'
import {
  useDocumentKitsQuery,
  useUpdateFolderStatusMutation,
} from '@/hooks/documents/useDocumentKitsQuery'
import { useFolderSlots } from '@/hooks/documents/useFolderSlots'
import { useDocumentStatuses } from '@/hooks/useStatuses'
import { useDocumentsDocumentActions } from '@/components/documents/Documents/hooks/useDocumentsDocumentActions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { documentKitKeys, folderSlotKeys } from '@/hooks/queryKeys'

type PlanSlotHandlers = {
  onSlotClick: (slotId: string, folderId: string) => void
  onSlotRename: (slotId: string, name: string) => void
}

const PlanSlotHandlersContext = createContext<PlanSlotHandlers | null>(null)

export function usePlanSlotHandlers(): PlanSlotHandlers {
  const ctx = useContext(PlanSlotHandlersContext)
  if (!ctx) throw new Error('usePlanSlotHandlers must be used within PlanDocsProvider')
  return ctx
}

export function PlanDocsProvider({
  projectId,
  workspaceId,
  enabled,
  children,
}: {
  projectId: string
  workspaceId: string
  /** Грузить движок слотов только когда в плане реально есть слоты. */
  enabled: boolean
  children: React.ReactNode
}) {
  const queryClient = useQueryClient()
  const { data: documentKits = [] } = useDocumentKitsQuery(projectId, enabled)
  const { uploadDocument, updateDocumentStatus, softDeleteDocument } = useDocuments(projectId)
  const { fillSlot, updateSlot, unlinkSlot } = useFolderSlots(projectId)
  const { data: statuses = [] } = useDocumentStatuses(workspaceId)
  const updateFolderStatus = useUpdateFolderStatusMutation()

  const invalidateDocumentKits = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: documentKitKeys.byProject(projectId) }),
      queryClient.invalidateQueries({ queryKey: folderSlotKeys.byProject(projectId) }),
    ])
  }, [queryClient, projectId])

  const fileUpload = useDocumentsFileUpload({
    documentKits,
    projectId,
    workspaceId,
    uploadDocument,
    fillSlot,
    invalidateDocumentKits,
  })

  // Действия над документом — реальные (статус, открыть, скачать, удалить).
  // Сжатие в плане не поддержано (живёт во вкладке «Документы») — стаб.
  const docActions = useDocumentsDocumentActions({
    documentKits,
    projectId,
    updateDocumentStatus,
    updateFolderStatus,
    softDeleteDocument,
    compressOps: { handleCompressSingleDocument: async () => {} },
  })

  const slotHandlers = useMemo<PlanSlotHandlers>(
    () => ({
      onSlotClick: fileUpload.handleSlotClick,
      onSlotRename: (slotId, name) => updateSlot({ slotId, updates: { name } }),
    }),
    [fileUpload.handleSlotClick, updateSlot],
  )

  const noop = () => {}

  return (
    <DocumentsProvider
      projectId={projectId}
      workspaceId={workspaceId}
      statuses={statuses}
      compressingDocIds={EMPTY_SET}
      uploadingSlotId={fileUpload.uploadingSlotId}
      highlightedCompressDocIds={EMPTY_SET}
      fileSizeWarnMb={null}
      fileSizeDangerMb={null}
      selectedDocuments={EMPTY_SET}
      hasSelection={false}
      onSelectDocument={noop}
      onStatusChange={docActions.handleStatusChange}
      onOpenEdit={noop}
      onOpenDocument={docActions.handleOpenDocumentById}
      onDownloadDocument={docActions.handleDownloadDocument}
      onDeleteDocument={docActions.handleDeleteDocument}
      onCompressDocument={noop}
      onMoveDocument={noop}
      onDuplicateDocument={noop}
      onSlotUnlink={(slotId) => unlinkSlot(slotId)}
      onSourceDocDrop={noop}
      onSourceDocSlotDrop={noop}
      onMessengerAttachmentDrop={noop}
      onMessengerAttachmentSlotDrop={noop}
      sourceUploadFolderId={null}
      sourceUploadPhase={null}
      sourceUploadTargetDocId={null}
      sourceUploadTargetPosition="bottom"
      draggedDocId={null}
      dragOverDocId={null}
      dragOverPosition="bottom"
      dragOverFolderId={null}
      onDocDragStart={noop}
      onDocDragOver={noop}
      onDocDragLeave={noop}
      onDocDragEnd={noop}
      onDocDrop={noop}
      onFolderDragOver={noop}
      onFolderDragLeave={noop}
      onFolderDrop={noop}
    >
      <PlanSlotHandlersContext.Provider value={slotHandlers}>
        <HiddenFileInputs
          fileInputRef={fileUpload.fileInputRef}
          slotFileInputRef={fileUpload.slotFileInputRef}
          onFileChange={fileUpload.handleFileChange}
          onSlotFileChange={fileUpload.handleSlotFileChange}
        />
        <ConfirmDialog {...docActions.confirmDialogProps} />
        {children}
      </PlanSlotHandlersContext.Provider>
    </DocumentsProvider>
  )
}

const EMPTY_SET: Set<string> = new Set()
