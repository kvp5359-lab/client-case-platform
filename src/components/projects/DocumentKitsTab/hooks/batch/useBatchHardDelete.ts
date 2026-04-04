/**
 * Хук для постоянного удаления документов (навсегда)
 */

import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { logAuditAction } from '@/services/auditService'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import type { ProjectPermissionCode } from '@/types/permissions'

interface UseBatchHardDeleteProps {
  projectId: string
  fetchDocumentKits: (projectId: string) => Promise<void>
  clearSelection: () => void
  hardDeleteDocument: (documentId: string) => Promise<void>
  requirePermission?: (
    module: 'settings' | 'forms' | 'documents',
    permission: ProjectPermissionCode,
  ) => void
}

export function useBatchHardDelete({
  projectId,
  fetchDocumentKits,
  clearSelection,
  hardDeleteDocument,
  requirePermission,
}: UseBatchHardDeleteProps) {
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  /**
   * Пакетное постоянное удаление документов (навсегда)
   */
  const handleBatchHardDelete = async (
    selectedDocuments: Set<string>,
    _setCheckingBatch?: (value: boolean) => void,
  ) => {
    const count = selectedDocuments.size
    if (count === 0) return

    try {
      requirePermission?.('documents', 'delete_documents')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Нет прав на удаление')
      return
    }

    const ok = await confirm({
      title: `Удалить ${count} документ(ов) навсегда?`,
      description: 'Это действие нельзя отменить. Все файлы будут удалены безвозвратно.',
      variant: 'destructive',
      confirmText: 'Удалить навсегда',
    })
    if (!ok) return

    try {
      const documentIds = Array.from(selectedDocuments)
      let successCount = 0
      let errorCount = 0

      const progressToastId = toast.loading(`Удаление: 0 / ${documentIds.length}...`)

      for (const docId of documentIds) {
        try {
          await hardDeleteDocument(docId)
          successCount++
        } catch (error) {
          logger.error(`Ошибка при постоянном удалении документа ${docId}:`, error)
          errorCount++
        }
        toast.loading(`Удаление: ${successCount + errorCount} / ${documentIds.length}...`, {
          id: progressToastId,
        })
      }

      toast.dismiss(progressToastId)

      await fetchDocumentKits(projectId)
      clearSelection()
      logAuditAction(
        'batch_hard_delete',
        'document',
        undefined,
        {
          project_id: projectId,
          document_ids: documentIds,
          success_count: successCount,
          error_count: errorCount,
        },
        projectId,
      )

      if (errorCount === 0) {
        toast.success(`${successCount} документ(ов) удалены навсегда`, {
          duration: 4000,
        })
      } else {
        toast.warning(`Удалено: ${successCount} из ${count}. Ошибок: ${errorCount}`, {
          duration: 5000,
        })
      }
    } catch (error) {
      logger.error('Ошибка при пакетном постоянном удалении:', error)
      toast.error('Ошибка при постоянном удалении документов', {
        duration: 4000,
      })
    }
  }

  const confirmDialogProps = {
    state: confirmState,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  }

  return {
    handleBatchHardDelete,
    confirmDialogProps,
  }
}
