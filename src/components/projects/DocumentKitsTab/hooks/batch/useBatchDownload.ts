/**
 * Хук для пакетного скачивания — делегирует в общую утилиту downloadDocumentsAsZip
 */

import { toast } from 'sonner'
import { downloadDocumentsAsZip } from '@/services/documents/downloadDocumentsAsZip'
import type { DocumentWithFiles } from '@/components/documents'

interface UseBatchDownloadProps {
  clearSelection: () => void
}

export function useBatchDownload({ clearSelection }: UseBatchDownloadProps) {
  const handleBatchDownload = async (
    selectedDocuments: Set<string>,
    kitDocuments: DocumentWithFiles[] | undefined,
    folders: { id: string; name: string }[],
  ) => {
    if (selectedDocuments.size === 0) {
      toast.error('Выберите документы для скачивания', { duration: 3000 })
      return
    }

    const documentIds = Array.from(selectedDocuments)
    const selectedDocs = kitDocuments?.filter((doc) => documentIds.includes(doc.id)) || []

    if (selectedDocs.length === 0) {
      toast.error('Документы не найдены', { duration: 3000 })
      return
    }

    const archiveName = `documents_${new Date().toISOString().split('T')[0]}.zip`

    await downloadDocumentsAsZip({
      docs: selectedDocs,
      folders,
      archiveName,
      mode: 'folders',
    })

    clearSelection()
  }

  return { handleBatchDownload }
}
