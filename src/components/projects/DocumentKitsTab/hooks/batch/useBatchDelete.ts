/**
 * Хук для пакетного удаления документов в корзину
 */

import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { logAuditAction } from '@/services/auditService'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'

interface UseBatchDeleteProps {
  projectId: string
  fetchDocumentKits: (projectId: string) => Promise<void>
  clearSelection: () => void
  softDeleteDocument: (documentId: string) => Promise<void>
}

export function useBatchDelete({
  projectId,
  fetchDocumentKits,
  clearSelection,
  softDeleteDocument,
}: UseBatchDeleteProps) {
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  /**
   * Пакетное удаление документов (в корзину)
   */
  const handleBatchDelete = async (
    selectedDocuments: Set<string>,
    _setCheckingBatch?: (value: boolean) => void,
  ) => {
    const count = selectedDocuments.size
    if (count === 0) return

    const ok = await confirm({
      title: `Удалить ${count} документ(ов)?`,
      description: 'Они будут перемещены в корзину.',
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return

    try {
      const documentIds = Array.from(selectedDocuments)
      let deleted = 0
      let errors = 0

      const progressToastId = toast.loading(`Удаление: 0/${count}...`)

      for (const docId of documentIds) {
        try {
          await softDeleteDocument(docId)
          deleted++
        } catch (error) {
          errors++
          logger.error('Ошибка удаления документа в корзину:', error)
        }
        toast.loading(`Удаление: ${deleted + errors}/${count}...`, { id: progressToastId })
      }

      toast.dismiss(progressToastId)
      await fetchDocumentKits(projectId)
      clearSelection()
      logAuditAction(
        'batch_delete',
        'document',
        undefined,
        {
          project_id: projectId,
          document_ids: documentIds,
          count,
          errors,
        },
        projectId,
      )

      if (errors > 0) {
        toast.warning(`Удалено ${deleted} из ${count}. Ошибок: ${errors}`, { duration: 5000 })
      } else {
        toast.success(`${count} документ(ов) перемещены в корзину`, { duration: 4000 })
      }
    } catch (error) {
      logger.error('Ошибка пакетного удаления документов:', error)
      toast.error('Ошибка при удалении документов', {
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
    handleBatchDelete,
    confirmDialogProps,
  }
}
