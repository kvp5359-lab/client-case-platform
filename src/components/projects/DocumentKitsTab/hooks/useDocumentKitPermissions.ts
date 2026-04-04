import { useProjectPermissions, useWorkspaceFeatures } from '@/hooks/permissions'

interface UseDocumentKitPermissionsParams {
  projectId: string
  workspaceId: string
}

export function useDocumentKitPermissions({
  projectId,
  workspaceId,
}: UseDocumentKitPermissionsParams) {
  const { can: hasProjectPermission, require: requirePermission } = useProjectPermissions({
    projectId,
  })
  const { isEnabled: isFeatureEnabled } = useWorkspaceFeatures({ workspaceId })

  return {
    requirePermission,
    canAddDocuments: hasProjectPermission('documents', 'add_documents'),
    canDeleteDocuments: hasProjectPermission('documents', 'delete_documents'),
    canMoveDocuments: hasProjectPermission('documents', 'move_documents'),
    canCompressPdf: hasProjectPermission('documents', 'compress_pdf'),
    canDownloadDocuments: hasProjectPermission('documents', 'download_documents'),
    canCreateFolders: hasProjectPermission('documents', 'create_folders'),
    canManageSettings: hasProjectPermission('settings', 'edit_project_info'),
    canUseAiDocumentCheck: isFeatureEnabled('ai_document_check'),
  }
}
