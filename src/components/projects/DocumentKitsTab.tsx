"use client"

import { useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Loader2 } from 'lucide-react'
import { useDocumentKitSetup } from './DocumentKitsTab/hooks'
import { DocumentKitProvider } from './DocumentKitsTab/context'
import { DocumentKitDialogs } from './DocumentKitsTab/components'
import { BatchCheckDialog } from './DocumentKitsTab/dialogs/BatchCheckDialog'
import { DocumentToolbar, SummaryDialog } from '@/components/documents'
import { SystemSectionContainer, FolderSectionsContainer } from './DocumentKitsTab/containers'
import { useDocumentKitsQuery } from '@/hooks/useDocumentKitsQuery'
import { useDocumentKitStatuses } from '@/hooks/useStatuses'
import { useFolderSlots } from '@/hooks/useFolderSlots'
import { useDocumentSummary } from '@/hooks/documents'
import { GenerateDocumentDialog } from '@/components/projects/GenerateDocumentDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { MoveDocumentDialog } from '@/components/documents'
import {
  useMoveDialogState,
  useSourceSettingsState,
  useDocumentKitUIStore,
} from '@/store/documentKitUI'
import { SourceSettingsDialog } from './DocumentKitsTab/dialogs/SourceSettingsDialog'

interface DocumentKitsTabProps {
  projectId: string
  workspaceId: string
  kitId: string
  sourceFolderId?: string | null
  exportFolderId?: string | null
  /** Показывать ли системную секцию (Нераспределённые/Источник/Корзина). По умолчанию true */
  showSystemSection?: boolean
  /** Показывать ли тулбар. По умолчанию true */
  showToolbar?: boolean
  /** Показывать ли папки с документами. По умолчанию true */
  showFolders?: boolean
}

/** Диалог настроек источника — рендерится отдельно, когда DocumentKitDialogs не рендерится */
function SourceSettingsStandaloneDialog({
  handlers,
}: {
  handlers: { onSaveSourceSettings: () => void | Promise<void> }
}) {
  const { sourceSettingsDialogOpen, isSourceConnected, sourceFolderName, sourceFolderLink } =
    useSourceSettingsState()
  const { openSourceSettingsDialog, closeSourceSettingsDialog, setSourceFolderLink } =
    useDocumentKitUIStore()

  return (
    <SourceSettingsDialog
      open={sourceSettingsDialogOpen}
      onOpenChange={(open) => (open ? openSourceSettingsDialog() : closeSourceSettingsDialog())}
      isConnected={isSourceConnected}
      folderName={sourceFolderName}
      sourceFolderLink={sourceFolderLink}
      onLinkChange={setSourceFolderLink}
      onSave={handlers.onSaveSourceSettings}
    />
  )
}

/** Диалог перемещения source doc — рендерится отдельно, когда DocumentKitDialogs не рендерится */
function SourceMoveDialog({
  folders,
  handlers,
}: {
  folders: { id: string; name: string }[]
  handlers: { onMoveSourceDocument: (folderId: string | null) => void }
}) {
  const { moveDialogOpen, sourceDocToMove, isMovingSourceDoc } = useMoveDialogState()
  const { closeMoveDialog } = useDocumentKitUIStore()

  if (!sourceDocToMove) return null

  return (
    <MoveDocumentDialog
      open={moveDialogOpen}
      onOpenChange={(o) => !o && closeMoveDialog()}
      folders={folders}
      isMoving={isMovingSourceDoc}
      onMove={handlers.onMoveSourceDocument}
    />
  )
}

function DocumentKitsTabContent(props: DocumentKitsTabProps) {
  const { showSystemSection = true, showToolbar = true, showFolders = true } = props
  const setup = useDocumentKitSetup(props)

  // Деструктурируем ref-объекты и данные до early returns,
  // чтобы React Compiler не считал обращение к ним "чтением ref во время рендера"
  const {
    folderFileInputRef,
    slotFileInputRef,
    handleFileChange,
    handleSlotFileChange,
    contextValue,
    kit,
    isLoading,
    toolbar,
    documentsByFolder,
    folders,
    ungroupedDocuments,
    uploadingFiles,
    dialogs,
  } = setup

  // --- Генерация документов ---
  const [generateDocOpen, setGenerateDocOpen] = useState(false)

  // --- Сводка по набору документов ---
  // NB: эти хуки дублируют вызовы из useDocumentKitSetup, но React Query
  // отдаёт данные из общего кэша — реальных повторных запросов к серверу нет.
  const { data: allKits = [] } = useDocumentKitsQuery(props.projectId)
  const { data: folderStatuses = [] } = useDocumentKitStatuses(props.workspaceId)
  const { slots: folderSlots } = useFolderSlots(props.projectId)
  const summary = useDocumentSummary({
    folderSlots,
    folderStatuses,
    workspaceId: props.workspaceId,
  })

  // === РЕНДЕРИНГ ===

  if (isLoading && !kit) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!kit) {
    return (
      <div className="rounded-lg border border-dashed p-12">
        <div className="text-center">
          <h3 className="text-lg font-medium mb-2">Набор не найден</h3>
          <p className="text-muted-foreground">Набор документов был удалён или не существует</p>
        </div>
      </div>
    )
  }

  return (
    <DocumentKitProvider value={contextValue}>
      <div className={showToolbar ? 'space-y-4' : ''}>
        <input
          ref={folderFileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          ref={slotFileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          onChange={handleSlotFileChange}
          className="hidden"
        />

        {showToolbar && (
          <DocumentToolbar
            {...toolbar}
            onGenerateSummary={
              allKits.length > 0 ? () => summary.generateSummary(allKits) : undefined
            }
            onGenerateDocument={() => setGenerateDocOpen(true)}
          />
        )}

        {/* FloatingBatchActions рендерится на уровне DocumentsTabContent для cross-kit selection */}

        <div className="space-y-4">
          {showSystemSection && <SystemSectionContainer />}

          {showFolders && (
            <>
              <FolderSectionsContainer documentsByFolder={documentsByFolder} />

              {folders.length === 0 &&
                ungroupedDocuments.length === 0 &&
                uploadingFiles.length === 0 && (
                  <div className="rounded-lg border border-dashed p-8 text-center">
                    <p className="text-muted-foreground">Нет документов в наборе</p>
                  </div>
                )}

              {uploadingFiles.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        Загружается файлов: {uploadingFiles.length}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {uploadingFiles.slice(0, 3).join(', ')}
                        {uploadingFiles.length > 3 && ` и ещё ${uploadingFiles.length - 3}...`}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {showFolders && (
          <>
            <DocumentKitDialogs handlers={dialogs.documentKitDialogHandlers} />

            {/* Confirm dialogs for hooks that use useConfirmDialog */}
            <ConfirmDialog {...dialogs.confirmDialogs.documentOps} />
            <ConfirmDialog {...dialogs.confirmDialogs.folderOps} />
            <ConfirmDialog {...dialogs.confirmDialogs.documentMerge} />
            <ConfirmDialog {...dialogs.confirmDialogs.batchDelete} />
            <ConfirmDialog {...dialogs.confirmDialogs.batchHardDelete} />
            <ConfirmDialog {...dialogs.confirmDialogs.handlers} />

            <BatchCheckDialog
              open={dialogs.batchCheck.open}
              onOpenChange={(open) => {
                if (!open) dialogs.batchCheck.onClose()
              }}
              documentIds={dialogs.batchCheck.documentIds}
              documentNames={dialogs.batchCheck.documentNames}
              statuses={dialogs.batchCheck.statuses}
              onComplete={dialogs.batchCheck.onComplete}
            />
          </>
        )}

        {/* Source dialogs — needs to render when system section is visible but folders are not */}
        {showSystemSection && !showFolders && (
          <>
            <SourceMoveDialog folders={folders} handlers={dialogs.documentKitDialogHandlers} />
            <SourceSettingsStandaloneDialog handlers={dialogs.documentKitDialogHandlers} />
          </>
        )}

        {/* Dialogs triggered from toolbar — must render even when showFolders=false */}
        <SummaryDialog
          open={summary.summaryDialogOpen}
          onOpenChange={summary.setSummaryDialogOpen}
          text={summary.summaryText}
          loading={summary.summaryLoading}
          copied={summary.copied}
          onCopy={summary.handleCopySummary}
        />

        <GenerateDocumentDialog
          open={generateDocOpen}
          onOpenChange={setGenerateDocOpen}
          projectId={props.projectId}
          workspaceId={props.workspaceId}
        />
      </div>
    </DocumentKitProvider>
  )
}

export function DocumentKitsTab(props: DocumentKitsTabProps) {
  return (
    <TooltipProvider>
      <DocumentKitsTabContent {...props} />
    </TooltipProvider>
  )
}
