/**
 * Общие типы для подкомпонентов batch-actions
 */

export type OperationProgress = { current: number; total: number } | null

export interface BatchOperations {
  isMerging: boolean
  isCompressing: boolean
  isCheckingBatch: boolean
  isExportingToDisk: boolean
  mergeProgress: OperationProgress
  compressProgress: OperationProgress
  exportProgress: OperationProgress
}

export interface BatchPermissions {
  canBatchCheck?: boolean
  canCompress?: boolean
  canMove?: boolean
  canDelete?: boolean
  canDownload?: boolean
}

export interface BatchHandlers {
  onClearSelection: () => void
  onBatchCheck: () => void
  onMerge: () => void
  onBatchCompress: () => void
  onBatchMove: (folderId: string | null) => void
  onBatchDelete: () => void
  onBatchHardDelete?: () => void
  onBatchDownload: () => void
  onBatchToggleHidden?: (hide: boolean) => void
  onBatchSetStatus?: (statusId: string | null) => void
  onSendToChat?: (target: 'client' | 'internal' | 'assistant') => void
}
