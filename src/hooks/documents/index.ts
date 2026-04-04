/**
 * Экспорт хуков для работы с документами
 */

export {
  useDocumentSelection,
  useGlobalSelectionCount,
  useGlobalSelectedIds,
  clearAllSelections,
} from './useDocumentSelection'
export { useGlobalBatchActions } from './useGlobalBatchActions'
export { useDocumentDragDrop } from './useDocumentDragDrop'
export { useSystemSectionTabs } from './useSystemSectionTabs'
export { useGroupedDocuments } from './useGroupedDocuments'
export { useDocumentSummary } from './useDocumentSummary'
export {
  useDocumentTemplates,
  useUploadDocumentTemplate,
  useUpdateDocumentTemplate,
  useDeleteDocumentTemplate,
  useGenerateDocument,
} from './useDocumentTemplates'
