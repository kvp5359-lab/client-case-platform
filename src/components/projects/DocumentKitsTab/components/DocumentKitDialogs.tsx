"use client"

/**
 * Компонент, объединяющий все диалоги DocumentKitsTab.
 * Читает state из Zustand stores и Context, получает только бизнес-handlers через props.
 */

import { MoveDocumentDialog, FolderDialog } from '@/components/documents'
import {
  EditDocumentDialog,
  ContentViewDialog,
  TemplateSelectDialog,
  MergeDocumentsDialog,
  ConnectSourceDialog,
  SourceSettingsDialog,
  ExportToGoogleDriveDialog,
  DocumentKitSettingsDialog,
} from '../dialogs'
import { ExportProgressDialog } from '../dialogs/ExportProgressDialog'
import {
  useDocumentKitDialogs,
  useDocumentKitOperations,
  useDocumentKitGoogleDrive,
  useDocumentKitUIStore,
} from '@/store/documentKitUI'
import { useDocumentKitData, useDocumentKitUIState, useDocumentKitIds } from '../context'

/** Бизнес-handlers, которые нельзя получить из Zustand */
export interface DocumentKitDialogHandlers {
  // Move
  onMoveDocument: (folderId: string | null) => void
  onMoveSourceDocument: (folderId: string | null) => void
  // Edit
  onSaveDocument: () => void
  onVerifyDocument: () => void
  onViewContent: () => void
  onOpenDocument?: () => void
  onClearContent: () => void
  // Templates
  onToggleTemplateSelection: (templateId: string) => void
  onCreateFoldersFromTemplates: () => void
  // Folder
  onSaveFolder: () => void
  // Merge
  onRemoveFromMerge: (docId: string) => void
  onMergeDragStart: (index: number) => void
  onMergeDragOver: (e: React.DragEvent, index: number) => void
  onMergeDragEnd: () => void
  onGenerateMergeName: () => void
  onMergeDocuments: () => void
  // Source
  onConnectSource: () => void
  onSaveSourceSettings: () => void
  // Export
  onExportToGoogleDrive: () => void
  onSaveExportSettings: () => void
  // AI
  onOpenAIChat?: () => void
}

export interface DocumentKitDialogsProps {
  handlers: DocumentKitDialogHandlers
}

export function DocumentKitDialogs({ handlers }: DocumentKitDialogsProps) {
  // --- Zustand state ---
  const {
    moveDialogOpen,
    sourceDocToMove,
    isMovingSourceDoc,
    editDialogOpen,
    documentToEdit,
    editName,
    editDescription,
    editStatus,
    contentViewDialogOpen,
    documentContent,
    addFolderDialogOpen,
    templateSelectDialogOpen,
    editingFolder,
    folderFormData,
    folderTemplates,
    loadingTemplates,
    selectedTemplateIds,
    kitSettingsDialogOpen,
  } = useDocumentKitDialogs()

  const {
    isCheckingDocument,
    suggestedNames,
    isLoadingContent,
    isMerging,
    mergeDialogOpen,
    mergeName,
    mergeFolderId,
    isGeneratingMergeName,
    mergeDocsList,
    draggedIndex,
    isExportingToDisk,
    exportToDiskDialogOpen,
    googleDriveFolderLink,
    exportSyncMode,
    exportPhase,
    exportDocuments,
    exportCleaningProgress,
    exportProgressDialogOpen,
  } = useDocumentKitOperations()

  const {
    connectSourceDialogOpen,
    sourceFolderLink,
    sourceSettingsDialogOpen,
    sourceFolderName,
    isSourceConnected,
    exportFolderName,
    isExportFolderConnected,
  } = useDocumentKitGoogleDrive()

  // --- Zustand actions ---
  const {
    closeMoveDialog,
    closeEditDialog,
    updateEditForm,
    closeContentViewDialog,
    openTemplateSelectDialog,
    closeTemplateSelectDialog,
    clearTemplateSelection,
    openAddFolderDialog,
    closeAddFolderDialog,
    closeEditFolderDialog,
    resetFolderForm,
    updateFolderForm,
    openMergeDialog,
    closeMergeDialog,
    updateMergeName,
    setMergeFolder,
    openConnectSourceDialog,
    closeConnectSourceDialog,
    setSourceFolderLink,
    openSourceSettingsDialog,
    closeSourceSettingsDialog,
    openExportDialog,
    closeExportDialog,
    setGoogleDriveFolderLink,
    setExportSyncMode,
    closeExportProgressDialog,
    openKitSettingsDialog,
    closeKitSettingsDialog,
  } = useDocumentKitUIStore()

  // --- Context data ---
  const { folders, statuses } = useDocumentKitData()
  const { selectedDocuments } = useDocumentKitUIState()
  const { workspaceId } = useDocumentKitIds()

  return (
    <>
      <MoveDocumentDialog
        open={moveDialogOpen}
        onOpenChange={(open) => !open && closeMoveDialog()}
        folders={folders}
        isMoving={isMovingSourceDoc}
        onMove={(folderId) =>
          sourceDocToMove
            ? handlers.onMoveSourceDocument(folderId)
            : handlers.onMoveDocument(folderId)
        }
      />

      <EditDocumentDialog
        open={editDialogOpen}
        onOpenChange={(open) => !open && closeEditDialog()}
        name={editName}
        description={editDescription}
        status={editStatus}
        suggestedNames={suggestedNames}
        isCheckingDocument={isCheckingDocument}
        documentToEdit={documentToEdit}
        statuses={statuses}
        onNameChange={(name) => updateEditForm('name', name)}
        onDescriptionChange={(description) => updateEditForm('description', description)}
        onStatusChange={(status) => updateEditForm('status', status)}
        onSave={handlers.onSaveDocument}
        onVerify={handlers.onVerifyDocument}
        onViewContent={handlers.onViewContent}
        onOpenDocument={handlers.onOpenDocument}
        onOpenAIChat={handlers.onOpenAIChat}
      />

      <ContentViewDialog
        open={contentViewDialogOpen}
        onOpenChange={(open) => !open && closeContentViewDialog()}
        documentName={documentToEdit?.name || ''}
        content={documentContent}
        isLoading={isLoadingContent}
        onClearContent={handlers.onClearContent}
      />

      <TemplateSelectDialog
        open={templateSelectDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            openTemplateSelectDialog()
          } else {
            closeTemplateSelectDialog()
            clearTemplateSelection()
          }
        }}
        templates={folderTemplates as Parameters<typeof TemplateSelectDialog>[0]['templates']}
        folders={folders as { id: string; folder_template_id?: string }[]}
        selectedTemplateIds={[...selectedTemplateIds]}
        isLoading={loadingTemplates}
        onToggleTemplate={handlers.onToggleTemplateSelection}
        onCreate={handlers.onCreateFoldersFromTemplates}
      />

      <FolderDialog
        open={addFolderDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            openAddFolderDialog()
          } else {
            closeAddFolderDialog()
            closeEditFolderDialog()
            resetFolderForm()
          }
        }}
        isEditing={!!editingFolder}
        name={folderFormData.name}
        description={folderFormData.description}
        aiNamingPrompt={folderFormData.aiNamingPrompt || ''}
        aiCheckPrompt={folderFormData.aiCheckPrompt || ''}
        knowledgeArticleId={folderFormData.knowledgeArticleId}
        workspaceId={workspaceId}
        onNameChange={(name) => updateFolderForm('name', name)}
        onDescriptionChange={(description) => updateFolderForm('description', description)}
        onAiNamingPromptChange={(prompt) => updateFolderForm('aiNamingPrompt', prompt)}
        onAiCheckPromptChange={(prompt) => updateFolderForm('aiCheckPrompt', prompt)}
        onKnowledgeArticleChange={(articleId) => updateFolderForm('knowledgeArticleId', articleId)}
        onSave={handlers.onSaveFolder}
        isSaving={false}
      />

      <MergeDocumentsDialog
        open={mergeDialogOpen}
        onOpenChange={(open) => (open ? openMergeDialog([]) : closeMergeDialog())}
        mergeDocsList={mergeDocsList}
        mergeName={mergeName}
        mergeFolderId={mergeFolderId}
        folders={folders}
        isMerging={isMerging}
        isGeneratingName={isGeneratingMergeName}
        draggedIndex={draggedIndex}
        onNameChange={updateMergeName}
        onFolderChange={setMergeFolder}
        onRemoveDoc={handlers.onRemoveFromMerge}
        onDragStart={handlers.onMergeDragStart}
        onDragOver={(e: React.DragEvent, index: number) => handlers.onMergeDragOver(e, index)}
        onDragEnd={handlers.onMergeDragEnd}
        onGenerateName={handlers.onGenerateMergeName}
        onMerge={handlers.onMergeDocuments}
      />

      <ConnectSourceDialog
        open={connectSourceDialogOpen}
        onOpenChange={(open) => (open ? openConnectSourceDialog() : closeConnectSourceDialog())}
        sourceFolderLink={sourceFolderLink}
        onLinkChange={setSourceFolderLink}
        onConnect={handlers.onConnectSource}
      />

      <SourceSettingsDialog
        open={sourceSettingsDialogOpen}
        onOpenChange={(open) => (open ? openSourceSettingsDialog() : closeSourceSettingsDialog())}
        isConnected={isSourceConnected}
        folderName={sourceFolderName}
        sourceFolderLink={sourceFolderLink}
        onLinkChange={setSourceFolderLink}
        onSave={handlers.onSaveSourceSettings}
      />

      <ExportToGoogleDriveDialog
        open={exportToDiskDialogOpen}
        onOpenChange={(open) => (open ? openExportDialog() : closeExportDialog())}
        folderLink={googleDriveFolderLink}
        selectedCount={selectedDocuments.size}
        isExporting={isExportingToDisk}
        syncMode={exportSyncMode}
        onLinkChange={setGoogleDriveFolderLink}
        onSyncModeChange={setExportSyncMode}
        onExport={handlers.onExportToGoogleDrive}
      />

      <ExportProgressDialog
        open={exportProgressDialogOpen}
        phase={exportPhase as Parameters<typeof ExportProgressDialog>[0]['phase']}
        cleaningProgress={exportCleaningProgress}
        documents={exportDocuments}
        onClose={closeExportProgressDialog}
      />

      <DocumentKitSettingsDialog
        open={kitSettingsDialogOpen}
        onOpenChange={(open) => (open ? openKitSettingsDialog() : closeKitSettingsDialog())}
        isSourceConnected={isSourceConnected}
        sourceFolderName={sourceFolderName}
        sourceFolderLink={sourceFolderLink}
        onSourceLinkChange={setSourceFolderLink}
        onSaveSourceSettings={handlers.onSaveSourceSettings}
        isExportFolderConnected={isExportFolderConnected}
        exportFolderName={exportFolderName}
        exportFolderLink={googleDriveFolderLink}
        onExportLinkChange={setGoogleDriveFolderLink}
        onSaveExportSettings={handlers.onSaveExportSettings}
      />
    </>
  )
}
