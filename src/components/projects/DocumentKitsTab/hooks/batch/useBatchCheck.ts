/**
 * Хук для пакетной AI проверки документов
 */

import { toast } from 'sonner'
import type { DocumentWithFiles } from '@/components/documents'

interface UseBatchCheckProps {
  openBatchCheckDialog: (documentIds: string[]) => void
}

export function useBatchCheck({ openBatchCheckDialog }: UseBatchCheckProps) {
  /**
   * Пакетная проверка документов через AI
   */
  const handleBatchCheck = async (
    selectedDocuments: Set<string>,
    _kitDocuments: DocumentWithFiles[] | undefined,
    _setCheckingBatch: (value: boolean) => void,
  ) => {
    if (selectedDocuments.size === 0) {
      toast.error('Выберите документы для проверки', {
        duration: 3000,
      })
      return
    }

    // Открываем модальное окно с выбранными документами
    const documentIds = Array.from(selectedDocuments)
    openBatchCheckDialog(documentIds)
  }

  return {
    handleBatchCheck,
  }
}
