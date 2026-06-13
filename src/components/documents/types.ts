/**
 * Типы для работы с документами.
 *
 * Доменные типы/предикаты/константы переехали в нейтральный `@/types/documents`
 * (T1 аудита 2026-06-13), чтобы нижние слои (services/hooks/store) не зависели
 * от слоя UI. Здесь — реэкспорт для обратной совместимости + UI-Props,
 * завязанные на React-события (им место рядом с компонентами).
 */

import type { DocumentWithFiles, SourceDocument } from '@/types/documents'

export * from '@/types/documents'

// Props для строки в корзине
export type TrashedDocumentRowProps = {
  document: DocumentWithFiles
  index: number
  isSelected: boolean
  hasSelection: boolean
  isHovered: boolean
  onSelect: (docId: string, event?: React.MouseEvent) => void
  onHover: (docId: string | null) => void
  onOpenEdit: (docId: string) => void
  onRestore: (docId: string) => void
  onDelete: (docId: string) => void
}

// Props для строки источника
export type SourceDocumentRowProps = {
  file: SourceDocument
  isSelected: boolean
  hasSelection: boolean
  isDragging: boolean
  onSelect: (fileId: string, event?: React.MouseEvent) => void
  onToggleHidden: (fileId: string) => void
  onDownload: (file: SourceDocument) => void
  onMove: (file: SourceDocument) => void
  onDragStart: (e: React.DragEvent, file: SourceDocument) => void
  onDragEnd: () => void
}
