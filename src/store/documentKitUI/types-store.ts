/**
 * Тип объединённого store DocumentKitUI.
 * Вынесен из index.ts в отдельный файл, чтобы его могли импортировать
 * select-функции без циклической зависимости через index.
 */

import type { UISlice } from './uiSlice'
import type { DialogsSlice } from './dialogsSlice'
import type { OperationsSlice } from './operationsSlice'
import type { GoogleDriveSlice } from './googleDriveSlice'

export type DocumentKitUIStore = UISlice &
  DialogsSlice &
  OperationsSlice &
  GoogleDriveSlice & {
    resetState: () => void
  }
