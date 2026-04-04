/**
 * FolderSectionsContainer — контейнер для папок с документами
 *
 * Рефакторинг: FolderSection теперь сама берёт данные из Context,
 * поэтому контейнер только передаёт folder, folderIndex и documents.
 */

import { FolderSection } from '@/components/documents'
import type { DocumentWithFiles } from '@/components/documents'
import { useDocumentKitContext } from '../context'

interface FolderSectionsContainerProps {
  documentsByFolder: Map<string, DocumentWithFiles[]>
}

export function FolderSectionsContainer({ documentsByFolder }: FolderSectionsContainerProps) {
  const { data, uiState } = useDocumentKitContext()

  return (
    <>
      {data.folders.map((folder, folderIndex) => {
        const folderDocuments = documentsByFolder.get(folder.id) || []

        // Пропускаем папки без документов при фильтре "только непроверенные"
        // Учитываем и слоты — слот с нефинальным документом тоже считается
        if (uiState.showOnlyUnverified && folderDocuments.length === 0) {
          const finalStatusIds = new Set(data.statuses.filter((s) => s.is_final).map((s) => s.id))
          const folderSlots = data.folderSlots.filter((s) => s.folder_id === folder.id)
          // Пустые слоты — всегда показываем (можно загрузить документ)
          const hasEmptySlot = folderSlots.some((s) => !s.document_id)
          // Заполненные слоты с нефинальным документом
          const hasVisibleFilledSlot = folderSlots.some((s) => {
            if (!s.document_id) return false
            const docStatus = s.document?.status
            if (!docStatus) return true
            return !finalStatusIds.has(docStatus)
          })
          if (!hasEmptySlot && !hasVisibleFilledSlot) return null
        }

        return (
          <FolderSection
            key={folder.id}
            folder={folder}
            folderIndex={folderIndex}
            documents={folderDocuments}
          />
        )
      })}
    </>
  )
}
