import { toast } from 'sonner'
import { useErrorHandler } from '@/hooks/shared/useErrorHandler'
import { useDocuments } from '@/hooks/useDocuments'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { openDocumentInNewTab, downloadDocumentFile } from '@/services/documents'
import type { DocumentWithFiles } from '@/components/documents'
import type { ProjectPermissionCode } from '@/types/permissions'

interface UseDocumentOperationsProps {
  projectId: string
  fetchDocumentKits: (projectId: string) => Promise<void>
  getDocument: (documentId: string) => DocumentWithFiles | undefined
  requirePermission: (
    module: 'settings' | 'forms' | 'documents',
    permission: ProjectPermissionCode,
  ) => void
}

export function useDocumentOperations({
  projectId,
  fetchDocumentKits,
  getDocument,
  requirePermission,
}: UseDocumentOperationsProps) {
  const { handleError } = useErrorHandler()
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()
  const {
    softDeleteDocument,
    hardDeleteDocument,
    restoreDocument,
    moveDocument,
    updateDocumentStatus,
    isMoving,
  } = useDocuments(projectId)

  // Перемещение документа в корзину
  const handleSoftDelete = async (documentId: string) => {
    try {
      requirePermission('documents', 'delete_documents')
      await softDeleteDocument(documentId)
      await fetchDocumentKits(projectId)
    } catch (error) {
      handleError(error, 'Ошибка при удалении')
    }
  }

  // Полное удаление документа
  const handleHardDelete = async (documentId: string) => {
    try {
      requirePermission('documents', 'delete_documents')
    } catch (error) {
      handleError(error, 'Нет прав на удаление')
      return
    }
    const ok = await confirm({
      title: 'Удалить документ навсегда?',
      description: 'Это действие нельзя отменить. Файл будет удалён безвозвратно.',
      variant: 'destructive',
      confirmText: 'Удалить навсегда',
    })
    if (!ok) return

    try {
      await hardDeleteDocument(documentId)
      await fetchDocumentKits(projectId)
    } catch (error) {
      handleError(error, 'Ошибка при полном удалении документа')
    }
  }

  // Восстановление документа из корзины
  const handleRestore = async (documentId: string) => {
    try {
      await restoreDocument(documentId)
      await fetchDocumentKits(projectId)
    } catch (error) {
      handleError(error, 'Ошибка при восстановлении документа')
    }
  }

  // Открытие документа в новой вкладке
  const handleOpen = async (documentId: string) => {
    try {
      const document = getDocument(documentId)
      if (!document) return

      const currentFile =
        document.document_files?.find((f) => f.is_current) || document.document_files?.[0]
      if (!currentFile) {
        toast.error('Файл не найден для документа')
        return
      }

      await openDocumentInNewTab(currentFile.file_path, currentFile.file_id)
    } catch (error) {
      handleError(error, 'Ошибка при открытии документа')
    }
  }

  // Скачивание документа
  const handleDownload = async (documentId: string) => {
    try {
      requirePermission('documents', 'download_documents')
      const doc = getDocument(documentId)
      if (!doc) {
        toast.error('Документ не найден')
        return
      }

      const currentFile = doc.document_files?.find((f) => f.is_current) || doc.document_files?.[0]
      if (!currentFile) {
        toast.error('Файл не найден для документа')
        return
      }

      await downloadDocumentFile(
        currentFile.file_path,
        currentFile.file_name || 'document',
        currentFile.file_id,
      )
    } catch (error) {
      handleError(error, 'Ошибка при скачивании файла')
    }
  }

  // Изменение статуса документа
  const handleStatusChange = async (
    documentId: string,
    newStatus: string | null,
    onStatusDropdownClose?: () => void,
  ) => {
    try {
      requirePermission('documents', 'edit_documents')
      await updateDocumentStatus({
        documentId,
        status: newStatus,
      })
      onStatusDropdownClose?.()
      await fetchDocumentKits(projectId)
    } catch (error) {
      handleError(error, 'Ошибка при изменении статуса документа')
    }
  }

  // Перемещение документа в папку
  const handleMove = async (documentId: string, folderId: string | null, onClose?: () => void) => {
    const toastId = toast.loading('Перемещение документа...')

    try {
      requirePermission('documents', 'move_documents')
      await moveDocument({
        documentId,
        folderId,
      })
      await fetchDocumentKits(projectId)
      onClose?.()

      toast.success('Документ перемещён', {
        id: toastId,
        duration: 3000,
      })
    } catch (error) {
      handleError(error, { userMessage: 'Не удалось переместить документ', showToast: false })
      toast.error('Ошибка перемещения', {
        id: toastId,
        description: 'Не удалось переместить документ',
      })
    }
  }

  const confirmDialogProps = {
    state: confirmState,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  }

  return {
    handleSoftDelete,
    handleHardDelete,
    handleRestore,
    handleOpen,
    handleDownload,
    handleStatusChange,
    handleMove,
    isMoving,
    confirmDialogProps,
  }
}
