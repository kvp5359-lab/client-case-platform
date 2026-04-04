/**
 * Хук для работы с документами и их файлами
 *
 * @param projectId — если передан, инвалидация кэша будет точечной (только этот проект).
 *                     Если не передан — инвалидируется весь кэш documentKits (fallback).
 */

import { useDocumentUpload } from './useDocumentUpload'
import { useDocumentMutations } from './useDocumentMutations'

export function useDocuments(projectId?: string) {
  const { uploadDocumentMutation, invalidateCache } = useDocumentUpload(projectId)

  const {
    softDeleteDocumentMutation,
    hardDeleteDocumentMutation,
    restoreDocumentMutation,
    moveDocumentMutation,
    updateDocumentStatusMutation,
    reorderDocumentsMutation,
    duplicateDocumentMutation,
  } = useDocumentMutations(projectId, invalidateCache)

  return {
    uploadDocument: uploadDocumentMutation.mutateAsync,
    softDeleteDocument: softDeleteDocumentMutation.mutateAsync,
    hardDeleteDocument: hardDeleteDocumentMutation.mutateAsync,
    restoreDocument: restoreDocumentMutation.mutateAsync,
    moveDocument: moveDocumentMutation.mutateAsync,
    duplicateDocument: duplicateDocumentMutation.mutateAsync,
    updateDocumentStatus: updateDocumentStatusMutation.mutateAsync,
    reorderDocuments: reorderDocumentsMutation.mutateAsync,
    isUploading: uploadDocumentMutation.isPending,
    isDeleting: softDeleteDocumentMutation.isPending || hardDeleteDocumentMutation.isPending,
    isRestoring: restoreDocumentMutation.isPending,
    isMoving: moveDocumentMutation.isPending,
    isDuplicating: duplicateDocumentMutation.isPending,
    isUpdatingStatus: updateDocumentStatusMutation.isPending,
    isReordering: reorderDocumentsMutation.isPending,
    uploadError: uploadDocumentMutation.error,
    deleteError: softDeleteDocumentMutation.error || hardDeleteDocumentMutation.error,
    restoreError: restoreDocumentMutation.error,
    moveError: moveDocumentMutation.error,
    duplicateError: duplicateDocumentMutation.error,
    statusError: updateDocumentStatusMutation.error,
    reorderError: reorderDocumentsMutation.error,
  }
}
