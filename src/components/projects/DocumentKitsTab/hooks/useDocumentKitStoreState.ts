import { useShallow } from 'zustand/shallow'
import {
  useDocumentKitUIStore,
  useDocumentKitUI,
  useDocumentKitDialogs,
  useDocumentKitOperations,
  useDocumentKitGoogleDrive,
  selectActions,
} from '@/store/documentKitUI'

export function useDocumentKitStoreState() {
  const uiState = useDocumentKitUI()
  const dialogs = useDocumentKitDialogs()
  const operations = useDocumentKitOperations()
  const googleDrive = useDocumentKitGoogleDrive()
  // Подписываемся только на actions (стабильные функции). useShallow
  // предотвращает ре-рендер при изменении невыбранных полей стора.
  const actions = useDocumentKitUIStore(useShallow(selectActions))

  return { uiState, dialogs, operations, googleDrive, actions }
}
