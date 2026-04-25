"use client"

/**
 * Вкладка «Документы» в боковой панели TaskPanel.
 * Обёртка над DocumentsTabContent: сама грузит documentKits и google_drive_folder_link
 * и управляет диалогом добавления набора документов. Используется по аналогии с
 * AllHistoryContent — чтобы показать в панели треда содержимое вкладки проекта 1:1.
 */

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { DocumentsTabContent } from '@/page-components/ProjectPage/components/DocumentsTabContent'
import { AddDocumentKitDialog } from '@/components/projects/AddDocumentKitDialog'
import { useDocumentKitsQuery } from '@/hooks/useDocumentKitsQuery'
import { useDialog } from '@/hooks/shared/useDialog'
import { useProjectPermissions } from '@/hooks/permissions/useProjectPermissions'
import { supabase } from '@/lib/supabase'

interface PanelDocumentsContentProps {
  projectId: string
  workspaceId: string
}

export function PanelDocumentsContent({ projectId, workspaceId }: PanelDocumentsContentProps) {
  const { data: documentKits = [], isLoading } = useDocumentKitsQuery(projectId)
  const addKitDialog = useDialog()
  const { can } = useProjectPermissions({ projectId })
  const canAddDocumentKits = can('documents', 'add_document_kits')

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
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <DocumentsTabContent
            documentKits={documentKits}
            projectId={projectId}
            workspaceId={workspaceId}
            onOpenAddKitDialog={canAddDocumentKits ? addKitDialog.open : undefined}
            googleDriveFolderLink={googleDriveFolderLink}
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
