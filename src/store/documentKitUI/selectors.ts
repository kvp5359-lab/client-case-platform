/**
 * Хуки-селекторы для DocumentKitUI Store
 *
 * Используют shallow comparison для оптимизации ререндеров.
 * Позволяют компонентам подписываться только на нужные части состояния.
 *
 * ДЛЯ ACTIONS: используйте **индивидуальный** селектор на каждую функцию,
 * либо `useShallow` с объектом — НЕ деструктурируйте `useDocumentKitUIStore()`
 * без селектора. Без селектора Zustand подписывает компонент на весь объект
 * стора, и любой `set()` (например, progress tick экспорта Google Drive)
 * вызывает ре-рендер даже если actions сами ссылочно стабильны.
 *
 * Правильно:
 *   const closeEditDialog = useDocumentKitUIStore((s) => s.closeEditDialog)
 *   // или
 *   const { closeEditDialog, updateEditForm } = useDocumentKitUIStore(
 *     useShallow((s) => ({
 *       closeEditDialog: s.closeEditDialog,
 *       updateEditForm: s.updateEditForm,
 *     }))
 *   )
 */

import { useShallow } from 'zustand/shallow'
import { useDocumentKitUIStore } from './store'
import {
  selectUI,
  selectDialogs,
  selectOperations,
  selectGoogleDrive,
  selectEditDialog,
  selectContentView,
  selectMoveDialog,
  selectMergeDialog,
  selectExportDialog,
  selectFolderDialogs,
  selectBatchCheck,
  selectCompress,
  selectSourceConnection,
  selectSourceSettings,
  selectConnectSource,
  selectKitSettings,
} from './selectFunctions'

// ─── Coarse-grained selectors (legacy, still used) ─────────────────────────

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

// ─── Granular selectors ─────────────────────────────────────────────────────
// Each hook subscribes only to the fields its UI concern needs.
// Prefer these over the coarse selectors above to reduce re-renders.

/** Edit document dialog — form fields + AI check */
export function useEditDialogState() {
  return useDocumentKitUIStore(useShallow(selectEditDialog))
}

/** Content view dialog */
export function useContentViewState() {
  return useDocumentKitUIStore(useShallow(selectContentView))
}

/** Move document dialog */
export function useMoveDialogState() {
  return useDocumentKitUIStore(useShallow(selectMoveDialog))
}

/** Merge documents dialog */
export function useMergeDialogState() {
  return useDocumentKitUIStore(useShallow(selectMergeDialog))
}

/** Export to Google Drive dialog + progress */
export function useExportDialogState() {
  return useDocumentKitUIStore(useShallow(selectExportDialog))
}

/** Folder / template dialogs */
export function useFolderDialogsState() {
  return useDocumentKitUIStore(useShallow(selectFolderDialogs))
}

/** Batch check dialog */
export function useBatchCheckState() {
  return useDocumentKitUIStore(useShallow(selectBatchCheck))
}

/** Compress operations */
export function useCompressState() {
  return useDocumentKitUIStore(useShallow(selectCompress))
}

/** Source connection info (name + connected status) */
export function useSourceConnectionState() {
  return useDocumentKitUIStore(useShallow(selectSourceConnection))
}

/** Source settings dialog */
export function useSourceSettingsState() {
  return useDocumentKitUIStore(useShallow(selectSourceSettings))
}

/** Connect source dialog */
export function useConnectSourceState() {
  return useDocumentKitUIStore(useShallow(selectConnectSource))
}

/** Kit settings dialog */
export function useKitSettingsState() {
  return useDocumentKitUIStore(useShallow(selectKitSettings))
}
