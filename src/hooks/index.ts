/**
 * Hooks - единая точка входа для всех хуков приложения
 */

// Shared hooks
export * from './shared'

// Document hooks
export * from './documents'

// Form Kit hooks
export { useFormKitAutoFill } from './useFormKitAutoFill'
export { useFormKitSync } from './useFormKitSync'
export { useFormKitFilter } from './useFormKitFilter'
export { useFormKitProgress } from './useFormKitProgress'
export { useFormKitSave } from './useFormKitSave'
export { useFormKitData } from './useFormKitData'
export { useFormKitsQuery } from './useFormKitsQuery'

// Form field hooks
export { useFormFieldSaveHandlers } from './useFormFieldSaveHandlers'

// Documents & Folders
export { useDocuments } from './useDocuments'
export { useDocumentKitsQuery } from './useDocumentKitsQuery'
export { useFolderSlots } from './useFolderSlots'

// Other
export { useDocumentStatuses, useDocumentKitStatuses } from './useStatuses'
export { useProjectHistory } from './useProjectHistory'
export { useIsMobile } from './use-mobile'
