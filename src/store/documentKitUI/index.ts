"use client"

/**
 * DocumentKit UI Store
 *
 * Zustand store для управления всем UI состоянием вкладки Document Kits.
 * Заменяет громоздкий documentKitReducer (699 строк, 85+ actions).
 *
 * Архитектура:
 * - 4 изолированных slices по функциональности
 * - store вынесен в store.ts, селекторы в selectFunctions.ts и selectors.ts
 * - index.ts — только публичное API (реэкспорты)
 */

// Сам store
export { useDocumentKitUIStore } from './store'

// Типы slices и store
export type { UISlice } from './uiSlice'
export type { DialogsSlice } from './dialogsSlice'
export type { OperationsSlice } from './operationsSlice'
export type { GoogleDriveSlice } from './googleDriveSlice'
export type { DocumentKitUIStore } from './types-store'

// Общие типы
export * from './types'

// Хуки-селекторы
export {
  useDocumentKitUI,
  useDocumentKitDialogs,
  useDocumentKitOperations,
  useDocumentKitGoogleDrive,
} from './selectors'

// Select-функции
export { selectUI, selectDialogs, selectOperations, selectGoogleDrive } from './selectFunctions'
