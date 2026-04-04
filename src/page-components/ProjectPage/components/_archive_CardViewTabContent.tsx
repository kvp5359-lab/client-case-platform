"use client"

/**
 * Карточное отображение документов
 * Папки документов отображаются как карточки в адаптивной сетке
 * Данные поступают из React Query через ProjectPage
 */

import { useState, useCallback, useMemo, memo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, ChevronDown, MoreHorizontal, FileText, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SummaryDialog } from '@/components/documents'
import { useGroupedDocuments } from '@/hooks/documents/useGroupedDocuments'
import { useDocumentSummary } from '@/hooks/documents/useDocumentSummary'
import { useFormSummary } from '@/hooks/forms/useFormSummary'
import { useDocumentStatuses, useDocumentKitStatuses } from '@/hooks/useStatuses'
import { useDocuments } from '@/hooks/useDocuments'
import { useDocumentEdit } from '@/components/projects/DocumentKitsTab/hooks/useDocumentEdit'
import { useDocumentVerify } from '@/components/projects/DocumentKitsTab/hooks/useDocumentVerify'
import {
  useDocumentKitUIStore,
  useDocumentKitDialogs,
  useDocumentKitOperations,
} from '@/store/documentKitUI'
import { EditDocumentDialog } from '@/components/projects/DocumentKitsTab/dialogs/EditDocumentDialog'
import { ContentViewDialog } from '@/components/projects/DocumentKitsTab/dialogs/ContentViewDialog'
import { FormStepper } from '@/components/forms/FormStepper'
import { FolderCard, UngroupedCard } from './CardView'
import { CardViewProvider } from './CardView/CardViewContext'
import { HiddenFileInputs } from './CardView/HiddenFileInputs'
import { useFolderSlots } from '@/hooks/useFolderSlots'
import { useDocumentCompress } from '@/components/projects/DocumentKitsTab/hooks/useDocumentCompress'
import { useUpdateFolderStatusMutation } from '@/hooks/useDocumentKitsQuery'
import { documentKitKeys } from '@/hooks/queryKeys'
import {
  useCollapsedFolders,
  useCardViewFileUpload,
  useCardViewSlotActions,
  useCardViewDocumentActions,
} from './CardView/hooks'
import type { DocumentStatus, FolderSlotWithDocument } from '@/components/documents/types'
import type { DocumentKitWithDocuments } from '@/components/documents/types'
import type { FormKit } from '@/components/forms/types'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { MoveDocumentDialog } from '@/components/documents'
import { CreateTaskDialog } from '@/components/tasks'
import { useDialog } from '@/hooks/shared/useDialog'
import { toast } from 'sonner'
import { safeCssColor } from '@/utils/isValidCssColor'

// === КОНСТАНТЫ ===

const EMPTY_SLOTS: FolderSlotWithDocument[] = []

// === ТИПЫ ===

interface CardViewTabContentProps {
  documentKits: DocumentKitWithDocuments[]
  formKits?: FormKit[]
  projectId: string
  workspaceId: string
}

interface KitCardViewSlotHandlers {
  onSlotClick: (slotId: string, folderId: string) => void
  onAddSlot: (folderId: string) => void
  onSlotDrop: (slotId: string, documentId: string) => void
  onSlotDelete: (slotId: string) => void
  onSlotRename: (slotId: string, name: string) => void
}

interface KitCardViewDocumentHandlers {
  onStatusChange: (docId: string, status: string | null) => void
  onFolderStatusChange: (folderId: string, status: string | null) => void
  onOpenEdit: (docId: string) => void
  onAddDocument: (folderId: string) => void
  onOpenDocument: (docId: string) => void
  onDownloadDocument: (docId: string) => void
  onDeleteDocument: (docId: string) => void
  onCompressDocument: (docId: string) => void
}

interface KitCardViewProps {
  kit: DocumentKitWithDocuments
  folderStatuses: DocumentStatus[]
  collapsedFolders: Set<string>
  onToggleCollapse: (folderId: string) => void
  folderSlots: FolderSlotWithDocument[]
  newSlotId: string | null
  onNewSlotCreated: () => void
  slotHandlers: KitCardViewSlotHandlers
  documentHandlers: KitCardViewDocumentHandlers
}

// === КОМПОНЕНТЫ ===

const KitCardView = memo(function KitCardView({
  kit,
  folderStatuses,
  collapsedFolders,
  onToggleCollapse,
  folderSlots,
  newSlotId,
  onNewSlotCreated,
  slotHandlers,
  documentHandlers,
}: KitCardViewProps) {
  const { onSlotClick, onAddSlot, onSlotDrop, onSlotDelete, onSlotRename } = slotHandlers
  const { onFolderStatusChange, onAddDocument } = documentHandlers
  const folders = useMemo(() => kit.folders || [], [kit.folders])
  const documents = useMemo(() => kit.documents || [], [kit.documents])

  // ID папок этого набора — для фильтрации слотов
  const kitFolderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders])

  // Группируем слоты по папкам, фильтруя только папки этого набора
  const slotsByFolder = useMemo(() => {
    const map = new Map<string, FolderSlotWithDocument[]>()
    for (const slot of folderSlots) {
      if (!kitFolderIds.has(slot.folder_id)) continue
      const arr = map.get(slot.folder_id) || []
      arr.push(slot)
      map.set(slot.folder_id, arr)
    }
    return map
  }, [folderSlots, kitFolderIds])

  // Собираем ID документов, привязанных к слотам этого набора, чтобы не показывать их дважды
  const slotDocumentIds = useMemo(() => {
    const ids = new Set<string>()
    slotsByFolder.forEach((slots) => {
      slots.forEach((s) => {
        if (s.document_id) ids.add(s.document_id)
      })
    })
    return ids
  }, [slotsByFolder])

  const { documentsByFolder, ungroupedDocuments } = useGroupedDocuments({
    documents,
    showOnlyUnverified: false,
    slotDocumentIds,
  })

  if (folders.length === 0 && documents.length === 0) {
    return (
      <div className="rounded-lg border p-12">
        <div className="text-center">
          <h3 className="text-lg font-medium mb-2">Нет документов</h3>
          <p className="text-muted-foreground">В этом наборе пока нет документов и папок</p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
      {folders.map((folder) => (
        <div key={folder.id}>
          <FolderCard
            folder={folder}
            documents={documentsByFolder.get(folder.id) || []}
            folderStatuses={folderStatuses}
            isCollapsed={collapsedFolders.has(folder.id)}
            onToggleCollapse={onToggleCollapse}
            onFolderStatusChange={onFolderStatusChange}
            onAddDocument={onAddDocument}
            slots={slotsByFolder.get(folder.id) || EMPTY_SLOTS}
            onSlotClick={onSlotClick}
            onAddSlot={onAddSlot}
            onSlotDrop={onSlotDrop}
            onSlotDelete={onSlotDelete}
            onSlotRename={onSlotRename}
            newSlotId={newSlotId}
            onNewSlotCreated={onNewSlotCreated}
          />
        </div>
      ))}
      {ungroupedDocuments.length > 0 && (
        <div>
          <UngroupedCard documents={ungroupedDocuments} />
        </div>
      )}
    </div>
  )
})

// === ЭКСПОРТ ===

export function CardViewTabContent({
  documentKits,
  formKits,
  projectId,
  workspaceId,
}: CardViewTabContentProps) {
  const [isStepperExpanded, setIsStepperExpanded] = useState(false)

  // Статусы из БД
  const { data: statuses = [] } = useDocumentStatuses(workspaceId)
  const { data: folderStatuses = [] } = useDocumentKitStatuses(workspaceId)

  // Слоты папок
  const {
    slots: folderSlots,
    fillSlot,
    createSlot,
    deleteSlot,
    updateSlot,
    unlinkSlot,
  } = useFolderSlots(projectId)

  // Операции с документами (projectId для точечной инвалидации кэша)
  const { updateDocumentStatus, uploadDocument, softDeleteDocument, moveDocument, isMoving } =
    useDocuments(projectId)
  const queryClient = useQueryClient()
  const updateFolderStatus = useUpdateFolderStatusMutation()

  // Инвалидация кэша документов
  const invalidateDocumentKits = useCallback(
    async (_projectId?: string) => {
      await queryClient.invalidateQueries({
        queryKey: documentKitKeys.byProject(_projectId || projectId),
      })
    },
    [queryClient, projectId],
  )

  // Сжатие PDF
  const compressOps = useDocumentCompress({
    projectId,
    fetchDocumentKits: invalidateDocumentKits,
    clearSelection: () => {},
  })
  const setCompressing = useDocumentKitUIStore((state) => state.setCompressing)

  // Zustand store для диалогов и операций
  const {
    editDialogOpen,
    documentToEdit,
    editName,
    editDescription,
    editStatus,
    contentViewDialogOpen,
    documentContent,
  } = useDocumentKitDialogs()

  const { suggestedNames, isCheckingDocument, isLoadingContent, compressingDocId } =
    useDocumentKitOperations()

  const { closeEditDialog, updateEditForm, closeContentViewDialog } = useDocumentKitUIStore()

  // Редактирование документа
  const documentEdit = useDocumentEdit(projectId, invalidateDocumentKits)
  const documentVerify = useDocumentVerify(projectId, invalidateDocumentKits)

  // --- Вынесенные хуки ---

  const {
    collapsedFolders,
    collapsedKits,
    handleToggleCollapse,
    handleToggleKit,
    collapseAllForKit,
    expandAllForKit,
    isAllCollapsedForKit,
  } = useCollapsedFolders(projectId, documentKits)

  const docActions = useCardViewDocumentActions({
    documentKits,
    projectId,
    updateDocumentStatus,
    updateFolderStatus,
    softDeleteDocument,
    compressOps,
    setCompressing,
  })

  const slotActions = useCardViewSlotActions({
    projectId,
    workspaceId,
    createSlot,
    deleteSlot,
    updateSlot,
    fillSlot,
    invalidateDocumentKits,
  })

  const fileUpload = useCardViewFileUpload({
    documentKits,
    projectId,
    workspaceId,
    uploadDocument,
    fillSlot,
    invalidateDocumentKits,
  })

  // Move document — диалог перемещения
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

  // Create task — диалог создания задачи
  const [taskDocId, setTaskDocId] = useState<string | null>(null)
  const createTaskDialog = useDialog()

  const handleCreateTask = useCallback(
    (docId: string) => {
      setTaskDocId(docId)
      createTaskDialog.open()
    },
    [createTaskDialog],
  )

  // Открепить документ от слота
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

  // Обработчик открытия диалога редактирования
  const handleOpenEditDialog = useCallback(
    (docId: string) => {
      const kit = docActions.getKit(docId)
      documentEdit.handleOpenEditDialog(docId, kit)
    },
    [docActions, documentEdit],
  )

  // Обработчик открытия документа из диалога редактирования
  const handleOpenDocument = useCallback(async () => {
    if (!documentToEdit) return
    await docActions.handleOpenDocumentById(documentToEdit.id)
  }, [documentToEdit, docActions])

  // Мемоизированные объекты handlers — стабильные ссылки для KitCardView
  const slotHandlers = useMemo<KitCardViewSlotHandlers>(
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

  const documentHandlers = useMemo<KitCardViewDocumentHandlers>(
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

  // --- Сводка по набору документов ---
  const summary = useDocumentSummary({ folderSlots, folderStatuses, workspaceId })

  // --- Сводка по анкете ---
  const formSummary = useFormSummary({ workspaceId })

  if (documentKits.length === 0) {
    return (
      <div className="rounded-lg border p-12">
        <div className="text-center">
          <h3 className="text-lg font-medium mb-2">Нет наборов документов</h3>
          <p className="text-muted-foreground">Добавьте набор документов на вкладке «Документы»</p>
        </div>
      </div>
    )
  }

  return (
    <CardViewProvider
      projectId={projectId}
      workspaceId={workspaceId}
      statuses={statuses}
      compressingDocId={compressingDocId}
      uploadingSlotId={fileUpload.uploadingSlotId}
      onStatusChange={docActions.handleStatusChange}
      onOpenEdit={handleOpenEditDialog}
      onOpenDocument={docActions.handleOpenDocumentById}
      onDownloadDocument={docActions.handleDownloadDocument}
      onDeleteDocument={docActions.handleDeleteDocument}
      onCompressDocument={docActions.handleCompressDocument}
      onMoveDocument={handleMoveDocument}
      onCreateTask={handleCreateTask}
      onSlotUnlink={handleSlotUnlink}
    >
      <TooltipProvider>
        <ConfirmDialog {...docActions.confirmDialogProps} />
        {/* Все анкеты */}
        {formKits &&
          formKits.length > 0 &&
          formKits.map((formKit) => (
            <div key={formKit.id} className="mt-6">
              <div className="flex items-center gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => handleToggleKit(formKit.id)}
                  className="flex items-center gap-2 group shrink-0"
                >
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 text-muted-foreground/70 transition-transform',
                      !collapsedKits.has(formKit.id) && 'rotate-90',
                    )}
                  />
                  <h3 className="text-lg font-medium text-foreground uppercase tracking-wide text-left">
                    {formKit.name}
                  </h3>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="p-1 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      onClick={() => formSummary.generateSummary(formKit.id, formKit.name)}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Сводка по анкете
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {!collapsedKits.has(formKit.id) && (
                <FormStepper
                  formKitId={formKit.id}
                  projectId={projectId}
                  workspaceId={workspaceId}
                  onExpandChange={setIsStepperExpanded}
                  eagerLoad
                />
              )}
            </div>
          ))}

        {/* Все наборы документов */}
        {documentKits.map((kit) => (
          <div
            key={kit.id}
            className={cn(
              '!mt-10',
              isStepperExpanded && 'opacity-25 pointer-events-none',
              collapsedKits.has(kit.id) &&
                'rounded-xl px-3 py-2 -mx-3 transition-shadow duration-200 hover:shadow-[0_0_30px_rgba(0,0,0,0.08)] cursor-pointer',
            )}
            onClick={collapsedKits.has(kit.id) ? () => handleToggleKit(kit.id) : undefined}
          >
            <div className="flex items-center gap-3 mb-3" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => handleToggleKit(kit.id)}
                className="flex items-center gap-2 group shrink-0"
              >
                <ChevronRight
                  className={cn(
                    'h-4 w-4 text-muted-foreground/70 transition-transform',
                    !collapsedKits.has(kit.id) && 'rotate-90',
                  )}
                />
                <h3 className="text-lg font-medium text-foreground uppercase tracking-wide text-left">
                  {kit.name}
                </h3>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="p-1 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => summary.generateSummary(kit)}>
                    <FileText className="h-4 w-4 mr-2" />
                    Сводка по документам
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {!collapsedKits.has(kit.id) && (
                <button
                  type="button"
                  onClick={
                    isAllCollapsedForKit(kit.id)
                      ? () => expandAllForKit(kit.id)
                      : () => collapseAllForKit(kit.id)
                  }
                  className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-2 decoration-muted-foreground/30 hover:decoration-muted-foreground/60 transition-colors"
                >
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform',
                      isAllCollapsedForKit(kit.id) && '-rotate-90',
                    )}
                  />
                  {isAllCollapsedForKit(kit.id) ? 'Развернуть все' : 'Свернуть все'}
                </button>
              )}
            </div>
            {collapsedKits.has(kit.id) && kit.folders && kit.folders.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 ml-6 -mt-1">
                {kit.folders.map((f) => {
                  const statusColor = f.status
                    ? folderStatuses.find((s) => s.id === f.status)?.color
                    : null
                  const color = statusColor ? safeCssColor(statusColor) : undefined
                  return (
                    <span
                      key={f.id}
                      className="inline-flex items-center gap-1 text-xs"
                      style={{ color: color ? `${color}99` : undefined, opacity: color ? 1 : 0.4 }}
                    >
                      <FolderOpen className="h-3 w-3" />
                      {f.name}
                    </span>
                  )
                })}
              </div>
            )}
            {!collapsedKits.has(kit.id) && (
              <KitCardView
                kit={kit}
                folderStatuses={folderStatuses}
                collapsedFolders={collapsedFolders}
                onToggleCollapse={handleToggleCollapse}
                folderSlots={folderSlots}
                newSlotId={slotActions.newSlotId}
                onNewSlotCreated={slotActions.handleNewSlotCreated}
                slotHandlers={slotHandlers}
                documentHandlers={documentHandlers}
              />
            )}
          </div>
        ))}

        {/* Диалог редактирования документа */}
        <EditDocumentDialog
          open={editDialogOpen}
          onOpenChange={(open) => {
            if (!open) closeEditDialog()
          }}
          name={editName}
          description={editDescription}
          status={editStatus}
          suggestedNames={suggestedNames}
          isCheckingDocument={isCheckingDocument}
          documentToEdit={documentToEdit}
          statuses={statuses}
          onNameChange={(name) => updateEditForm('name', name)}
          onDescriptionChange={(desc) => updateEditForm('description', desc)}
          onStatusChange={(status) => updateEditForm('status', status)}
          onSave={documentEdit.handleSaveDocument}
          onVerify={documentVerify.handleVerifyDocument}
          onViewContent={documentEdit.handleViewContent}
          onOpenDocument={handleOpenDocument}
        />

        {/* Диалог просмотра содержимого */}
        <ContentViewDialog
          open={contentViewDialogOpen}
          onOpenChange={(open) => {
            if (!open) closeContentViewDialog()
          }}
          documentName={documentToEdit?.name || ''}
          content={documentContent}
          isLoading={isLoadingContent}
          onClearContent={documentEdit.handleClearContent}
        />
        <HiddenFileInputs
          fileInputRef={fileUpload.fileInputRef}
          slotFileInputRef={fileUpload.slotFileInputRef}
          onFileChange={fileUpload.handleFileChange}
          onSlotFileChange={fileUpload.handleSlotFileChange}
        />

        <SummaryDialog
          open={summary.summaryDialogOpen}
          onOpenChange={summary.setSummaryDialogOpen}
          text={summary.summaryText}
          loading={summary.summaryLoading}
          copied={summary.copied}
          onCopy={summary.handleCopySummary}
        />
        <SummaryDialog
          open={formSummary.summaryDialogOpen}
          onOpenChange={formSummary.setSummaryDialogOpen}
          text={formSummary.summaryText}
          loading={formSummary.summaryLoading}
          copied={formSummary.copied}
          onCopy={formSummary.handleCopySummary}
        />
        {/* Диалог перемещения документа */}
        <MoveDocumentDialog
          open={moveDialog.isOpen}
          onOpenChange={(open) => !open && moveDialog.close()}
          folders={allFolders}
          isMoving={isMoving}
          onMove={handleMoveToFolder}
        />

        {/* Диалог создания задачи */}
        <CreateTaskDialog
          open={createTaskDialog.isOpen}
          onOpenChange={createTaskDialog.setOpen}
          projectId={projectId}
          workspaceId={workspaceId}
          initialDocumentId={taskDocId}
        />
      </TooltipProvider>
    </CardViewProvider>
  )
}
