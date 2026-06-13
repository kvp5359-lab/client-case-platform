"use client"

/**
 * Вкладка «Документы» в боковой панели TaskPanel.
 * Обёртка над DocumentsTabContent: сама грузит documentKits и google_drive_folder_link
 * и управляет диалогом добавления набора документов. Используется по аналогии с
 * AllHistoryContent — чтобы показать в панели треда содержимое вкладки проекта 1:1.
 */

import { useEffect, useState } from 'react'
import { PageLoader } from '@/components/ui/loaders'
import { DocumentsTabContent } from '@/components/documents/DocumentsTabContent'
import { AddDocumentKitDialog } from '@/components/projects/AddDocumentKitDialog'
import { useDocumentKitsQuery } from '@/hooks/documents/useDocumentKitsQuery'
import { useDialog } from '@/hooks/shared/useDialog'
import { useProjectPermissions } from '@/hooks/permissions/useProjectPermissions'
import { useProjectData } from '@/hooks/projects/useProjectData'
import { supabase } from '@/lib/supabase'

type PanelDocumentsContentProps = {
  projectId: string
  workspaceId: string
}

export function PanelDocumentsContent({ projectId, workspaceId }: PanelDocumentsContentProps) {
  const { data: documentKits = [], isLoading } = useDocumentKitsQuery(projectId)
  const addKitDialog = useDialog()
  const { can } = useProjectPermissions({ projectId })
  const canAddDocumentKits = can('documents', 'add_document_kits')

  // Пороги размера файла из шаблона проекта — для подсветки тега размера.
  const { projectTemplate } = useProjectData(projectId)

  // Google Drive folder link — нужен DocumentsTabContent для «Создать папки в Drive».
  const [googleDriveFolderLink, setGoogleDriveFolderLink] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    supabase
      .from('projects')
      .select('google_drive_folder_link')
      .eq('id', projectId)
      .single()
      .then(({ data }) => {
        if (!cancelled) setGoogleDriveFolderLink(data?.google_drive_folder_link ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="pl-8 pr-4 py-3 space-y-6">
        {isLoading ? (
          <PageLoader />
        ) : (
          <DocumentsTabContent
            documentKits={documentKits}
            projectId={projectId}
            workspaceId={workspaceId}
            onOpenAddKitDialog={canAddDocumentKits ? addKitDialog.open : undefined}
            googleDriveFolderLink={googleDriveFolderLink}
            fileSizeWarnMb={projectTemplate?.file_size_warn_mb ?? null}
            fileSizeDangerMb={projectTemplate?.file_size_danger_mb ?? null}
            compact
          />
        )}
      </div>

      <AddDocumentKitDialog
        open={addKitDialog.isOpen}
        onOpenChange={(open) => (open ? addKitDialog.open() : addKitDialog.close())}
        projectId={projectId}
        workspaceId={workspaceId}
      />
    </div>
  )
}
