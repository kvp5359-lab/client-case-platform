"use client"

/**
 * Содержимое всех вкладок страницы проекта
 *
 * Оптимизация: условный рендеринг вместо Radix TabsContent.
 * Только активная вкладка монтируется — неактивные не запускают useQuery.
 * Тяжёлые вкладки загружаются через React.lazy (code splitting).
 */

import { lazy, Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { ProjectParticipants } from '@/components/projects/ProjectParticipants'
import { GoogleDriveSection } from './GoogleDriveSection'
import { ProjectSettingsSection } from './ProjectSettingsSection'
import type { Project } from '../types'
import type { UseDialogReturn } from '@/hooks/shared/useDialog'
import type { FormKit } from '@/hooks/useFormKitsQuery'
import type { DocumentKit } from '@/services/api/documents/documentKitService'

// Lazy-loaded tab contents (code splitting)
const FormsTabContent = lazy(() =>
  import('./FormsTabContent').then((m) => ({ default: m.FormsTabContent })),
)
const DocumentsTabContent = lazy(() =>
  import('./DocumentsTabContent').then((m) => ({ default: m.DocumentsTabContent })),
)
const TasksTabContent = lazy(() =>
  import('./TasksTabContent').then((m) => ({ default: m.TasksTabContent })),
)
const KnowledgeBaseTabContent = lazy(() =>
  import('./KnowledgeBaseTabContent').then((m) => ({ default: m.KnowledgeBaseTabContent })),
)
const HistoryTabContent = lazy(() =>
  import('@/components/history/HistoryTabContent').then((m) => ({
    default: m.HistoryTabContent,
  })),
)

function TabLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

interface GoogleDriveState {
  googleDriveFolderName: string | null
  isLoadingFolderName: boolean
  dialogOpen: boolean
  folderLink: string
  openDialog: () => void
  closeDialog: () => void
  setFolderLink: (link: string) => void
}

interface ProjectTabsContentProps {
  project: Project
  projectId: string
  workspaceId: string
  activeTab: string
  modules: Record<string, boolean>
  // Settings tab
  canEditProjectInfo: boolean
  canManageGoogleDrive: boolean
  templateName: string | null
  templates: Array<{ id: string; name: string }>
  onStatusChange: (status: string) => void
  onDeadlineChange: (date: Date | undefined) => void
  onDescriptionChange: (description: string) => void
  onTemplateChange: (templateId: string | null) => void
  googleDrive: GoogleDriveState
  isSavingGoogleDrive: boolean
  onSaveGoogleDriveLink: () => Promise<void>
  onCreateGoogleDriveFolder: (folderName: string) => Promise<void>
  onDisconnectGoogleDrive: () => Promise<void>
  rootFolderId?: string | null
  // Forms tab
  formKits: FormKit[]
  canAddForms: boolean
  addFormKitDialog: UseDialogReturn
  // Documents tab
  documentKits: DocumentKit[]
  canAddDocumentKits: boolean
  addKitDialog: UseDialogReturn
}

export function ProjectTabsContent({
  project,
  projectId,
  workspaceId,
  activeTab,
  modules,
  canEditProjectInfo,
  canManageGoogleDrive,
  templateName,
  templates,
  onStatusChange,
  onDeadlineChange,
  onDescriptionChange,
  onTemplateChange,
  googleDrive,
  isSavingGoogleDrive,
  onSaveGoogleDriveLink,
  onCreateGoogleDriveFolder,
  onDisconnectGoogleDrive,
  rootFolderId,
  formKits,
  canAddForms,
  addFormKitDialog,
  documentKits,
  canAddDocumentKits,
  addKitDialog,
}: ProjectTabsContentProps) {
  return (
    <Suspense fallback={<TabLoading />}>
      {/* Вкладка "Настройки" */}
      {activeTab === 'settings' && modules.settings && (
        <div className="space-y-6 mt-2">
          {/* Секция «Основное» */}
          <div className="max-w-3xl rounded-lg border p-6">
            <h3 className="text-base font-semibold mb-4">Основное</h3>
            <ProjectSettingsSection
              project={project}
              templateName={templateName}
              templates={templates}
              canEditProjectInfo={canEditProjectInfo}
              onStatusChange={onStatusChange}
              onDeadlineChange={onDeadlineChange}
              onDescriptionChange={onDescriptionChange}
              onTemplateChange={onTemplateChange}
            />
          </div>

          {/* Секция «Интеграции» */}
          <div className="max-w-3xl rounded-lg border p-6">
            <h3 className="text-base font-semibold mb-4">Интеграции</h3>
            <GoogleDriveSection
              googleDriveFolderLink={project.google_drive_folder_link}
              folderName={googleDrive.googleDriveFolderName}
              isLoadingFolderName={googleDrive.isLoadingFolderName}
              dialogOpen={googleDrive.dialogOpen}
              folderLink={googleDrive.folderLink}
              isSaving={isSavingGoogleDrive}
              canManageGoogleDrive={canManageGoogleDrive}
              rootFolderId={rootFolderId}
              projectName={project.name}
              onOpenDialog={googleDrive.openDialog}
              onCloseDialog={googleDrive.closeDialog}
              onFolderLinkChange={googleDrive.setFolderLink}
              onSave={onSaveGoogleDriveLink}
              onCreateFolder={onCreateGoogleDriveFolder}
              onDisconnect={onDisconnectGoogleDrive}
            />
          </div>

          {/* Секция «Участники» */}
          <div className="max-w-3xl rounded-lg border p-6">
            <h3 className="text-base font-semibold mb-4">Участники</h3>
            <ProjectParticipants
              projectId={projectId}
              workspaceId={project.workspace_id}
              createdBy={project.created_by}
              createdAt={project.created_at}
            />
          </div>
        </div>
      )}

      {/* Вкладка "Анкеты" */}
      {activeTab === 'forms' && modules.forms && (
        <div className="space-y-6 mt-2">
          <FormsTabContent
            formKits={formKits}
            projectId={projectId}
            workspaceId={workspaceId}
            project={project}
            canAddForms={canAddForms}
            onAddFormKit={addFormKitDialog.open}
          />
        </div>
      )}

      {/* Вкладка "Задачи" — часть объединённого модуля `threads` */}
      {activeTab === 'tasks' && modules.threads && (
        <div className="space-y-6 mt-2">
          <TasksTabContent projectId={projectId} workspaceId={workspaceId} />
        </div>
      )}

      {/* Вкладка "Финансы" */}
      {activeTab === 'finances' && modules.finances && (
        <div className="space-y-6 mt-2">
          <div className="rounded-lg border p-12">
            <div className="text-center">
              <h3 className="text-lg font-medium mb-2">Финансы</h3>
              <p className="text-muted-foreground">
                Здесь будет отображаться финансовая информация проекта
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Вкладка "История" */}
      {activeTab === 'history' && modules.history && (
        <div className="mt-2">
          <HistoryTabContent projectId={projectId} workspaceId={workspaceId} />
        </div>
      )}

      {/* Вкладка "Материалы" (База знаний) */}
      {activeTab === 'knowledge-base' && modules.knowledgeBase && (
        <div className="space-y-6 mt-2">
          <KnowledgeBaseTabContent
            projectId={projectId}
            workspaceId={workspaceId}
            templateId={project.template_id}
          />
        </div>
      )}

      {/* Вкладка "Документы" */}
      {activeTab === 'documents' && modules.documents && (
        <div className="space-y-6 mt-2 focus-visible:ring-0 focus-visible:ring-offset-0">
          <DocumentsTabContent
            documentKits={documentKits}
            projectId={projectId}
            workspaceId={workspaceId}
            onOpenAddKitDialog={canAddDocumentKits ? addKitDialog.open : undefined}
            googleDriveFolderLink={project.google_drive_folder_link}
          />
        </div>
      )}
    </Suspense>
  )
}
