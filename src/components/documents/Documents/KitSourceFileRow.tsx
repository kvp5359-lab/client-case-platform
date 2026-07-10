"use client"

import { useToggleKitSourceHidden } from '@/hooks/documents/useSourceDocumentsQuery'
import { useDocumentsContext } from './DocumentsContext'
import { SourceFileRow } from './SourceFileRow'
import type { SourceDocument } from '@/types/documents'

/**
 * Строка файла из источника Google Drive в «лотке» набора.
 * Тонкая обёртка над презентационным `SourceFileRow`: подтягивает пороги размера
 * из `DocumentsContext` и мутацию скрытия. Строка перетаскиваемая.
 */
export function KitSourceFileRow({
  doc,
  onAccept,
}: {
  doc: SourceDocument
  /** Принять файл в набор (в папку). Не задан → кнопки нет (напр. корневые файлы). */
  onAccept?: () => Promise<void> | void
}) {
  const toggleHidden = useToggleKitSourceHidden()
  const { fileSizeWarnMb, fileSizeDangerMb } = useDocumentsContext()

  return (
    <SourceFileRow
      doc={doc}
      warnMb={fileSizeWarnMb}
      dangerMb={fileSizeDangerMb}
      onToggleHidden={(sourceDocId, hidden) => toggleHidden.mutate({ sourceDocId, hidden })}
      togglingHidden={toggleHidden.isPending}
      onAccept={onAccept}
      draggable
    />
  )
}
