/**
 * Экспорт компонентов для работы с документами
 */

// Типы и утилиты
export * from './types'

// Базовые компоненты
export { TableColgroup } from './TableColgroup'
export { DocumentRow } from './DocumentRow'
export { EmptySlotsRow } from './SlotRow'
export { TrashedDocumentRow } from './TrashedDocumentRow'
export { SourceDocumentRow } from './SourceDocumentRow'

// Секции
export { FolderSection } from './FolderSection'
// SystemSection встроен в SystemSectionContainer (DocumentKitsTab/containers)

// Панель инструментов
export { DocumentToolbar } from './DocumentToolbar'
export { FloatingBatchActions } from './FloatingBatchActions'
export type { FloatingBatchActionsProps } from './FloatingBatchActions'

// Сводка
export { SummaryDialog } from './SummaryDialog'

// Диалоги
export * from './dialogs'
