/**
 * Композитный хук для пакетных операций с документами
 * Объединяет все микро-хуки batch операций
 */

import { useBatchDelete, useBatchHardDelete, useBatchCheck, useBatchDownload } from './batch'
import type { ProjectPermissionCode } from '@/types/permissions'

interface UseBatchOperationsProps {
  projectId: string
  fetchDocumentKits: (projectId: string) => Promise<void>
  clearSelection: () => void
  softDeleteDocument: (documentId: string) => Promise<void>
  hardDeleteDocument: (documentId: string) => Promise<void>
  openBatchCheckDialog: (documentIds: string[]) => void
  requirePermission?: (
    module: 'settings' | 'forms' | 'documents',
    permission: ProjectPermissionCode,
  ) => void
}

/**
 * Композитный хук для всех пакетных операций
 * Использует микро-хуки для каждой операции
 */
export function useBatchOperations({
  projectId,
  fetchDocumentKits,
  clearSelection,
  softDeleteDocument,
  hardDeleteDocument,
  openBatchCheckDialog,
  requirePermission,
}: UseBatchOperationsProps) {
  // Микро-хуки для каждой операции
  const { handleBatchDelete, confirmDialogProps: batchDeleteConfirmDialogProps } = useBatchDelete({
    projectId,
    fetchDocumentKits,
    clearSelection,
    softDeleteDocument,
  })

  const { handleBatchHardDelete, confirmDialogProps: batchHardDeleteConfirmDialogProps } =
    useBatchHardDelete({
      projectId,
      fetchDocumentKits,
      clearSelection,
      hardDeleteDocument,
      requirePermission,
    })

  const { handleBatchCheck } = useBatchCheck({
    openBatchCheckDialog,
  })

  const { handleBatchDownload } = useBatchDownload({
    clearSelection,
  })

  return {
    handleBatchDelete,
    handleBatchHardDelete,
    handleBatchCheck,
    handleBatchDownload,
    batchDeleteConfirmDialogProps,
    batchHardDeleteConfirmDialogProps,
  }
}
