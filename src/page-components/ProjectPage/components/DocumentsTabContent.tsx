"use client"

/**
 * Карточное отображение документов
 * Папки документов отображаются как карточки в адаптивной сетке
 * Данные поступают из React Query через ProjectPage
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { useDocumentStatuses, useDocumentKitStatuses } from '@/hooks/useStatuses'
import { useDocuments } from '@/hooks/useDocuments'
import { useDocumentKitUIStore, useCompressState } from '@/store/documentKitUI'
import { useSourceDocumentsQuery } from '@/hooks/documents/useSourceDocumentsQuery'
import { UngroupedCard } from './Documents'
import { DocumentsProvider } from './Documents/DocumentsContext'
import { KitDocuments } from './Documents/KitDocuments'
import type { KitSlotHandlers, KitDocumentHandlers } from './Documents/KitDocuments'
import { DocumentsToolbar } from './Documents/DocumentsToolbar'
import { DocumentsTip } from './Documents/DocumentsTip'
import { CollapsedKitHeader } from './Documents/CollapsedKitHeader'
import { DocumentsDialogs } from './Documents/DocumentsDialogs'
import { useFolderSlots } from '@/hooks/useFolderSlots'
import { useDocumentCompress } from '@/components/projects/DocumentKitsTab/hooks/useDocumentCompress'
import { useUpdateFolderStatusMutation } from '@/hooks/useDocumentKitsQuery'
import { documentKitKeys, folderSlotKeys } from '@/hooks/queryKeys'
import { useKitlessDocumentsQuery } from '@/hooks/documents/useKitlessDocumentsQuery'
import {
  useCollapsedFolders,
  useDocumentsFileUpload,
  useDocumentsSlotActions,
  useDocumentsDocumentActions,
  useDocumentsDragDrop,
  useFolderCRUD,
  useSourceDocumentDrop,
  useMessengerAttachmentDrop,
  useKitlessUpload,
  useKitActions,
  useKitDownload,
  useCompressAnalysis,
  useDocumentsDialogActions,
  useDocumentsFlatList,
  useDocumentsProviderProps,
  useDocumentsDialogsProps,
} from './Documents/hooks'
import type { DocumentKitWithDocuments } from '@/components/documents/types'
import { useProjectPermissions } from '@/hooks/permissions/useProjectPermissions'
import { toggleSourceDocumentHidden } from '@/services/documents/sourceDocumentService'
import { useDocumentSelection } from '@/hooks/documents/useDocumentSelection'
import { CreateDriveFoldersDialog } from './Documents/CreateDriveFoldersDialog'

// === ТИПЫ ===

interface DocumentsTabContentProps {
  documentKits: DocumentKitWithDocuments[]
  projectId: string
  workspaceId: string
  onOpenAddKitDialog?: () => void
  googleDriveFolderLink?: string | null
}

// === ЭКСПОРТ ===

export function DocumentsTabContent({
  documentKits,
  projectId,
  workspaceId,
  onOpenAddKitDialog,
  googleDriveFolderLink,
}: DocumentsTabContentProps) {
  const [filterMode, setFilterMode] = useState<'all' | 'action-required'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [generateDocOpen, setGenerateDocOpen] = useState(false)
  const sidePanelOpen = useSidePanelStore((s) => s.panelTab !== null)
  const cardMaxW = !sidePanelOpen ? 'max-w-[789px]' : ''
  const { can } = useProjectPermissions({ projectId })
  const canAddDocuments = can('documents', 'add_documents')
  const canCreateFolders = can('documents', 'create_folders')

  // Drive folders dialog
  const [driveFoldersKit, setDriveFoldersKit] = useState<DocumentKitWithDocuments | null>(null)

  const { data: kitlessDocuments = [] } = useKitlessDocumentsQuery(projectId)

  // Слоты папок
  const {
    slots: folderSlots,
    fillSlot,
    createSlot,
    deleteSlot,
    updateSlot,
    unlinkSlot,
  } = useFolderSlots(projectId)

  // allUngroupedDocuments + allDocumentsFlat — мемоизированные списки, вынесены в хук
  const { allUngroupedDocuments, allDocumentsFlat } = useDocumentsFlatList(
    documentKits,
    kitlessDocuments,
    folderSlots,
  )

  // Selection
  const { selectedDocuments, hasSelection, toggleSelection, clearSelection } = useDocumentSelection(
    {
      allDocuments: allDocumentsFlat,
    },
  )
  const handleSelectDocument = useCallback(
    (docId: string, event?: React.MouseEvent) => toggleSelection(docId, allDocumentsFlat, event),
    [toggleSelection, allDocumentsFlat],
  )
  useEffect(() => {
    clearSelection()
  }, [filterMode, clearSelection])

  // Статусы
  const { data: statuses = [] } = useDocumentStatuses(workspaceId)
  const { data: folderStatuses = [] } = useDocumentKitStatuses(workspaceId)

  // Операции с документами
  const {
    updateDocumentStatus,
    uploadDocument,
    softDeleteDocument,
    hardDeleteDocument,
    moveDocument,
    duplicateDocument,
    reorderDocuments,
    isMoving,
    isDuplicating,
  } = useDocuments(projectId)
  const queryClient = useQueryClient()
  const updateFolderStatus = useUpdateFolderStatusMutation()

  const invalidateDocumentKits = useCallback(
    async (_projectId?: string) => {
      const pid = _projectId || projectId
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentKitKeys.byProject(pid) }),
        queryClient.invalidateQueries({ queryKey: folderSlotKeys.byProject(pid) }),
      ])
    },
    [queryClient, projectId],
  )

  // === Вынесенные хуки ===
  const { collapsedKits, handleToggleKit } = useCollapsedFolders(projectId, documentKits)

  const addCompressingDoc = useDocumentKitUIStore((state) => state.addCompressingDoc)
  const removeCompressingDoc = useDocumentKitUIStore((state) => state.removeCompressingDoc)
  const setCompressProgress = useDocumentKitUIStore((state) => state.setCompressProgress)
  const compressOps = useDocumentCompress({
    projectId,
    fetchDocumentKits: invalidateDocumentKits,
    clearSelection: () => {},
    addCompressingDoc,
    removeCompressingDoc,
    setCompressProgress,
  })
  const { data: sourceDocuments = [] } = useSourceDocumentsQuery(projectId)

  const docActions = useDocumentsDocumentActions({
    documentKits,
    kitlessDocuments,
    projectId,
    updateDocumentStatus,
    updateFolderStatus,
    softDeleteDocument,
    compressOps,
  })
  const slotActions = useDocumentsSlotActions({
    projectId,
    workspaceId,
    createSlot,
    deleteSlot,
    updateSlot,
    fillSlot,
    invalidateDocumentKits,
  })
  const fileUpload = useDocumentsFileUpload({
    documentKits,
    projectId,
    workspaceId,
    uploadDocument,
    fillSlot,
    invalidateDocumentKits,
  })
  const dragDrop = useDocumentsDragDrop({
    documentKits,
    projectId,
    reorderDocuments,
    invalidateDocumentKits,
  })
  const sourceDrop = useSourceDocumentDrop({
    documentKits,
    projectId,
    workspaceId,
    invalidateDocumentKits,
    hardDeleteDocument,
    fillSlot,
    reorderDocuments,
  })
  const messengerDrop = useMessengerAttachmentDrop({
    documentKits,
    projectId,
    workspaceId,
    invalidateDocumentKits,
    fillSlot,
    reorderDocuments,
  })
  const kitlessUpload = useKitlessUpload({ projectId, workspaceId, uploadDocument })
  const kitActions = useKitActions({ projectId, documentKits })
  const kitDownload = useKitDownload()
  const compressAnalysis = useCompressAnalysis({ documentKits })
  const { clearHighlightedCompressDocs } = compressAnalysis
  useEffect(() => {
    clearHighlightedCompressDocs()
  }, [filterMode, searchQuery, clearHighlightedCompressDocs])
  const folderCRUD = useFolderCRUD({ projectId, workspaceId, documentKits, invalidateDocumentKits })

  // Диалоговые операции вынесены в отдельный хук
  const dialogActions = useDocumentsDialogActions({
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
    toggleSourceDocHidden: toggleSourceDocumentHidden,
    sourceDrop,
    invalidateDocumentKits,
    unlinkSlot,
    docActions,
  })
  const {
    handleMoveDocument,
    handleDuplicateDocument,
    handleSlotUnlink,
    handleOpenEditDialog,
    summary,
  } = dialogActions

  const { compressingDocIds } = useCompressState()

  // Props для <DocumentsDialogs> — Zustand-селекторы документного стора
  // и сборка всех 19 диалоговых пропсов инкапсулированы в этом хуке,
  // чтобы не раздувать оркестратор.
  const dialogsProps = useDocumentsDialogsProps({
    workspaceId,
    documentKits,
    statuses,
    isMoving,
    isDuplicating,
    dialogActions,
    docActions,
    fileUpload,
    kitlessUpload,
    kitActions,
    kitDownload,
    folderCRUD,
    compressAnalysis,
  })

  // Props для <DocumentsProvider> — плоский объект с 40+ полями,
  // собирается отдельно, чтобы JSX-разметка не тонула в пропсах.
  const providerProps = useDocumentsProviderProps({
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
    onSelectDocument: handleSelectDocument,
    handleOpenEditDialog,
    handleMoveDocument,
    handleDuplicateDocument,
    handleSlotUnlink,
  })

  // Мемоизированные handler-объекты для KitDocuments
  const slotHandlers = useMemo<KitSlotHandlers>(
    () => ({
      onSlotClick: fileUpload.handleSlotClick,
      onAddSlot: slotActions.handleAddSlot,
      onSlotDrop: slotActions.handleSlotDrop,
      onSlotDelete: slotActions.handleSlotDelete,
      onSlotRename: slotActions.handleSlotRename,
    }),
    [
      fileUpload.handleSlotClick,
      slotActions.handleAddSlot,
      slotActions.handleSlotDrop,
      slotActions.handleSlotDelete,
      slotActions.handleSlotRename,
    ],
  )

  const documentHandlers = useMemo<KitDocumentHandlers>(
    () => ({
      onStatusChange: docActions.handleStatusChange,
      onFolderStatusChange: docActions.handleFolderStatusChange,
      onOpenEdit: handleOpenEditDialog,
      onAddDocument: fileUpload.handleAddDocument,
      onOpenDocument: docActions.handleOpenDocumentById,
      onDownloadDocument: docActions.handleDownloadDocument,
      onDeleteDocument: docActions.handleDeleteDocument,
      onCompressDocument: docActions.handleCompressDocument,
    }),
    [
      docActions.handleStatusChange,
      docActions.handleFolderStatusChange,
      handleOpenEditDialog,
      fileUpload.handleAddDocument,
      docActions.handleOpenDocumentById,
      docActions.handleDownloadDocument,
      docActions.handleDeleteDocument,
      docActions.handleCompressDocument,
    ],
  )

  if (documentKits.length === 0) {
    return (
      <div className="rounded-lg border p-12">
        <div className="text-center">
          <h3 className="text-lg font-medium mb-2">Нет наборов документов</h3>
          <p className="text-muted-foreground">
            Добавьте первый набор документов, нажав кнопку выше
          </p>
        </div>
      </div>
    )
  }

  return (
    <DocumentsProvider {...providerProps}>
      <TooltipProvider>
        <DocumentsToolbar
          filterMode={filterMode}
          setFilterMode={setFilterMode}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          documentKits={documentKits}
          onKitlessDocument={kitlessUpload.handleKitlessDocument}
          onAddDocument={fileUpload.handleAddDocument}
          onOpenAddKitDialog={onOpenAddKitDialog}
          generateDocOpen={generateDocOpen}
          setGenerateDocOpen={setGenerateDocOpen}
          projectId={projectId}
          workspaceId={workspaceId}
          compressAnalysisItems={compressAnalysis.compressAnalysisItems}
          setCompressAnalysisOpen={compressAnalysis.setCompressAnalysisOpen}
        />

        <div className={cardMaxW}>
          <DocumentsTip />
        </div>

        {allUngroupedDocuments.length > 0 && (
          <div className={cn('!mt-5', cardMaxW)}>
            <UngroupedCard documents={allUngroupedDocuments} />
          </div>
        )}

        {documentKits.map((kit, kitIndex) => (
          <div
            key={kit.id}
            className={cn('!mt-5', cardMaxW, collapsedKits.has(kit.id) && 'cursor-pointer')}
            onClick={collapsedKits.has(kit.id) ? () => handleToggleKit(kit.id) : undefined}
          >
            {collapsedKits.has(kit.id) ? (
              <CollapsedKitHeader
                kitName={kit.name}
                onToggle={() => handleToggleKit(kit.id)}
                onGenerateSummary={() => summary.generateSummary(kit)}
              />
            ) : (
              <KitDocuments
                kit={kit}
                kitName={kit.name}
                onToggleKit={() => handleToggleKit(kit.id)}
                onGenerateSummary={() => summary.generateSummary(kit)}
                filterMode={filterMode}
                searchQuery={searchQuery}
                folderStatuses={folderStatuses}
                folderSlots={folderSlots}
                newSlotId={slotActions.newSlotId}
                onNewSlotCreated={slotActions.handleNewSlotCreated}
                slotHandlers={
                  canAddDocuments ? slotHandlers : { ...slotHandlers, onAddSlot: undefined }
                }
                documentHandlers={
                  canAddDocuments
                    ? documentHandlers
                    : { ...documentHandlers, onAddDocument: undefined }
                }
                onAddFolder={canCreateFolders ? folderCRUD.handleOpenAddFolder : undefined}
                onSyncKit={kitActions.handleSyncKit}
                onDeleteKit={kitActions.handleDeleteKit}
                onDownloadKit={kitDownload.handleDownloadKit}
                onEditFolder={canCreateFolders ? folderCRUD.handleOpenEditFolder : undefined}
                onDeleteFolder={canCreateFolders ? folderCRUD.handleDeleteFolder : undefined}
                onCreateDriveFolders={googleDriveFolderLink ? setDriveFoldersKit : undefined}
                onMoveKit={kitActions.handleMoveKit}
                isFirst={kitIndex === 0}
                isLast={kitIndex === documentKits.length - 1}
              />
            )}
          </div>
        ))}

        <DocumentsDialogs {...dialogsProps} />
        <CreateDriveFoldersDialog
          open={!!driveFoldersKit}
          onOpenChange={(open) => !open && setDriveFoldersKit(null)}
          kit={driveFoldersKit}
          googleDriveFolderLink={googleDriveFolderLink}
          workspaceId={workspaceId}
        />
      </TooltipProvider>
    </DocumentsProvider>
  )
}
