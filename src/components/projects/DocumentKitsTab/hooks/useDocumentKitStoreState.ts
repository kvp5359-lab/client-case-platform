import {
  useDocumentKitUIStore,
  useDocumentKitUI,
  useDocumentKitDialogs,
  useDocumentKitOperations,
  useDocumentKitGoogleDrive,
} from '@/store/documentKitUI'

export function useDocumentKitStoreState() {
  const uiState = useDocumentKitUI()
  const dialogs = useDocumentKitDialogs()
  const operations = useDocumentKitOperations()
  const googleDrive = useDocumentKitGoogleDrive()
  const actions = useDocumentKitUIStore()

  return { uiState, dialogs, operations, googleDrive, actions }
}
