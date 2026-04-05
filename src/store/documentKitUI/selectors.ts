/**
 * Хуки-селекторы для DocumentKitUI Store
 *
 * Используют shallow comparison для оптимизации ререндеров.
 * Позволяют компонентам подписываться только на нужные части состояния.
 *
 * Для actions используйте useDocumentKitUIStore() напрямую.
 */

import { useShallow } from 'zustand/shallow'
import { useDocumentKitUIStore } from './store'
import {
  selectUI,
  selectDialogs,
  selectOperations,
  selectGoogleDrive,
} from './selectFunctions'

/**
 * UI состояние: collapse, hover, tabs, фильтры
 */
export function useDocumentKitUI() {
  return useDocumentKitUIStore(useShallow(selectUI))
}

/**
 * Состояние диалогов (20+ диалогов)
 */
export function useDocumentKitDialogs() {
  return useDocumentKitUIStore(useShallow(selectDialogs))
}

/**
 * Операции: AI check, merge, compress, export
 */
export function useDocumentKitOperations() {
  return useDocumentKitUIStore(useShallow(selectOperations))
}

/**
 * Google Drive: source, destination
 */
export function useDocumentKitGoogleDrive() {
  return useDocumentKitUIStore(useShallow(selectGoogleDrive))
}
