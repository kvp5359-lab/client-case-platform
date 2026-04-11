/**
 * Диалоги страницы проекта:
 * - AddDocumentKitDialog
 * - AddFormKitDialog
 */

import { AddDocumentKitDialog } from '@/components/projects/AddDocumentKitDialog'
import { AddFormKitDialog } from '@/components/projects/AddFormKitDialog'
import type { UseDialogReturn } from '@/hooks/shared/useDialog'
import type { ProjectTemplateWithRelations } from '../types'

interface ProjectPageDialogsProps {
  projectId: string
  workspaceId: string
  projectTemplate: ProjectTemplateWithRelations | null | undefined
  googleDriveFolderLink: string | null | undefined
  projectName: string | undefined
  addKitDialog: UseDialogReturn
  addFormKitDialog: UseDialogReturn
  onTabChange: (tab: string) => void
}

export function ProjectPageDialogs({
  projectId,
  workspaceId,
  projectTemplate,
  googleDriveFolderLink,
  projectName,
  addKitDialog,
  addFormKitDialog,
  onTabChange,
}: ProjectPageDialogsProps) {
  return (
    <>
      {/* Диалог добавления набора документов */}
      <AddDocumentKitDialog
        open={addKitDialog.isOpen}
        onOpenChange={(open) => (open ? addKitDialog.open() : addKitDialog.close())}
        projectId={projectId}
        workspaceId={workspaceId}
        templateDocumentKitIds={
          projectTemplate?.project_template_document_kits?.map(
            (rel) => rel.document_kit_template_id,
          ) || []
        }
        onKitCreated={() => {
          onTabChange('documents')
        }}
      />

      {/* Диалог добавления анкеты */}
      <AddFormKitDialog
        open={addFormKitDialog.isOpen}
        onOpenChange={(open) => (open ? addFormKitDialog.open() : addFormKitDialog.close())}
        projectId={projectId}
        workspaceId={workspaceId}
        templateFormIds={
          projectTemplate?.project_template_forms?.map((rel) => rel.form_template_id) || []
        }
        googleDriveFolderLink={googleDriveFolderLink}
        projectName={projectName}
        onKitCreated={() => {
          onTabChange('forms')
        }}
      />
    </>
  )
}
