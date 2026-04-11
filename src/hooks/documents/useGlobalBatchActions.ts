"use client"

/**
 * Глобальные batch actions для cross-kit selection
 * Работает с документами из всех наборов по ID
 */

import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { logAuditAction } from '@/services/auditService'
import {
  downloadDocumentsAsZip,
  type DownloadGroupMode,
} from '@/services/documents/downloadDocumentsAsZip'
import { useDocuments } from '@/hooks/useDocuments'
import { useDocumentKitsQuery } from '@/hooks/useDocumentKitsQuery'
import { useDocumentStatuses } from '@/hooks/useStatuses'
import { useProjectPermissions, useWorkspaceFeatures } from '@/hooks/permissions'
import { documentKitKeys } from '@/hooks/queryKeys'
import {
  useGlobalSelectionCount,
  useGlobalSelectedIds,
  clearAllSelections,
} from './useDocumentSelection'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { useDocumentKitUIStore, useCompressState } from '@/store/documentKitUI'
import { useDocumentCompress } from '@/components/projects/DocumentKitsTab/hooks/useDocumentCompress'
import {
  useBatchDelete,
  useBatchHardDelete,
} from '@/components/projects/DocumentKitsTab/hooks/batch'
import type { FloatingBatchActionsProps } from '@/components/documents/FloatingBatchActions'
import { getCurrentDocumentFile } from '@/utils/documentUtils'
import { useGlobalBatchMerge } from './useGlobalBatchMerge'

interface UseGlobalBatchActionsParams {
  projectId: string
  workspaceId: string
  sourceDocuments?: { id: string; isHidden?: boolean; sourceDocumentId: string }[]
  onBatchMoveSource?: (folderId: string | null) => Promise<void>
  onToggleSourceDocHidden?: (sourceDocId: string, currentHidden: boolean) => Promise<void>
  onAfterBatchToggle?: () => Promise<void>
}

export function useGlobalBatchActions({
  projectId,
  workspaceId,
  sourceDocuments,
  onBatchMoveSource,
  onToggleSourceDocHidden,
  onAfterBatchToggle,
}: UseGlobalBatchActionsParams) {
  const globalCount = useGlobalSelectionCount()
  const globalSelectedIds = useGlobalSelectedIds()
  const { data: documentKits = [] } = useDocumentKitsQuery(projectId)
  const { softDeleteDocument, hardDeleteDocument } = useDocuments(projectId)
  const { data: statuses = [] } = useDocumentStatuses(workspaceId)
  const { can: hasPermission, hasModuleAccess } = useProjectPermissions({ projectId })
  const { isEnabled } = useWorkspaceFeatures({ workspaceId })

  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false)

  const addCompressingDoc = useDocumentKitUIStore((s) => s.addCompressingDoc)
  const removeCompressingDoc = useDocumentKitUIStore((s) => s.removeCompressingDoc)
  const setCompressProgress = useDocumentKitUIStore((s) => s.setCompressProgress)

  // Сжатие PDF
  const queryClient = useQueryClient()
  const invalidateDocumentKits = useCallback(async () => {
    await queryClient.refetchQueries({
      queryKey: documentKitKeys.byProject(projectId),
    })
  }, [queryClient, projectId])
  // Adapter: batch hooks require (projectId: string) => Promise<void> signature
  const invalidateDocumentKitsAdapter = useCallback(
    async (_projectId: string) => {
      await invalidateDocumentKits()
    },
    [invalidateDocumentKits],
  )
  const compressOps = useDocumentCompress({
    projectId,
    fetchDocumentKits: invalidateDocumentKits,
    clearSelection: () => clearAllSelections(),
    addCompressingDoc,
    removeCompressingDoc,
    setCompressProgress,
  })
  const { isCompressing, compressProgress } = useCompressState()

  // Batch delete / hard delete — переиспользуем хуки из batch/
  const { handleBatchDelete: doBatchDelete, confirmDialogProps: batchDeleteConfirmProps } =
    useBatchDelete({
      projectId,
      fetchDocumentKits: invalidateDocumentKitsAdapter,
      clearSelection: () => clearAllSelections(),
      softDeleteDocument,
    })
  const {
    handleBatchHardDelete: doBatchHardDelete,
    confirmDialogProps: batchHardDeleteConfirmProps,
  } = useBatchHardDelete({
    projectId,
    fetchDocumentKits: invalidateDocumentKitsAdapter,
    clearSelection: () => clearAllSelections(),
    hardDeleteDocument,
  })

  // Все документы из всех наборов
  const allDocuments = useMemo(() => {
    return documentKits.flatMap((kit) => kit.documents ?? [])
  }, [documentKits])

  // Все папки из всех наборов
  const allFolders = useMemo(() => {
    return documentKits.flatMap((kit) => kit.folders ?? [])
  }, [documentKits])

  // Выбранные документы с данными
  const selectedDocs = useMemo(() => {
    return allDocuments.filter((doc) => globalSelectedIds.has(doc.id))
  }, [allDocuments, globalSelectedIds])

  const hasSelection = globalCount > 0

  // === Handlers ===

  const handleClearSelection = useCallback(() => {
    clearAllSelections()
  }, [])

  const handleBatchDelete = useCallback(async () => {
    if (globalSelectedIds.size === 0) return
    await doBatchDelete(globalSelectedIds)
  }, [globalSelectedIds, doBatchDelete])

  const handleBatchHardDelete = useCallback(async () => {
    if (globalSelectedIds.size === 0) return
    await doBatchHardDelete(globalSelectedIds)
  }, [globalSelectedIds, doBatchHardDelete])

  const handleBatchDownload = useCallback(() => {
    if (selectedDocs.length === 0) return
    setDownloadDialogOpen(true)
  }, [selectedDocs.length])

  const handleBatchDownloadConfirm = useCallback(
    async (mode: DownloadGroupMode) => {
      setIsDownloading(true)
      try {
        await downloadDocumentsAsZip({
          docs: selectedDocs,
          folders: allFolders,
          archiveName: 'documents',
          mode,
        })
        logAuditAction('batch_download', 'document', undefined, {
          document_ids: Array.from(globalSelectedIds),
          count: selectedDocs.length,
          mode,
        })
        clearAllSelections()
        setDownloadDialogOpen(false)
      } catch (error) {
        logger.error('Ошибка скачивания:', error)
        toast.error(error instanceof Error ? error.message : 'Ошибка при скачивании документов')
      } finally {
        setIsDownloading(false)
      }
    },
    [selectedDocs, allFolders, globalSelectedIds],
  )

  const { handleMerge } = useGlobalBatchMerge({ workspaceId, documentKits, globalSelectedIds })

  const handleBatchCompress = useCallback(async () => {
    if (globalSelectedIds.size === 0) return
    await compressOps.handleBatchCompress(globalSelectedIds, allDocuments)
  }, [globalSelectedIds, allDocuments, compressOps])

  const handleSendToChat = useCallback(
    (target: 'client' | 'internal' | 'assistant') => {
      if (selectedDocs.length === 0) return
      const store = useSidePanelStore.getState()
      if (target === 'assistant') {
        store.openAssistantWithDocuments(
          selectedDocs.map((d) => ({
            id: d.id,
            name: d.name,
            textContent: d.text_content ?? null,
          })),
        )
      } else {
        store.sendDocumentsToMessenger(
          selectedDocs.map((d) => d.id),
          target,
        )
      }
    },
    [selectedDocs],
  )

  // Проверяем, есть ли среди selected docs удалённые
  const hasTrashDocs = selectedDocs.some((d) => d.is_deleted)

  // Проверяем — все выбранные ID принадлежат source-документам (вкладка «Источник»)
  const sourceDocIds = useMemo(
    () => new Set((sourceDocuments ?? []).map((d) => d.id)),
    [sourceDocuments],
  )
  const isSourceTab = useMemo(
    () => globalCount > 0 && [...globalSelectedIds].every((id) => sourceDocIds.has(id)),
    [globalCount, globalSelectedIds, sourceDocIds],
  )

  // was hasPermission('documents.manage') — 1 arg instead of 2, always returned false
  const canDeleteDocuments = hasPermission('documents', 'delete_documents')
  const canDownloadDocuments = hasPermission('documents', 'download_documents')
  const canUseAi = isEnabled('ai_document_check')
  // «Отправить в» доступна только если есть объединённый модуль threads
  // (старый internal_messenger) или любой AI.
  const canSendToChat =
    hasModuleAccess('threads') ||
    hasModuleAccess('ai_knowledge_all') ||
    hasModuleAccess('ai_knowledge_project') ||
    hasModuleAccess('ai_project_assistant')

  const selectedSourceDocsAllHidden = useMemo(() => {
    if (!isSourceTab || globalCount === 0 || !sourceDocuments) return false
    const selected = sourceDocuments.filter((d) => globalSelectedIds.has(d.id))
    return selected.length > 0 && selected.every((d) => d.isHidden)
  }, [isSourceTab, globalCount, globalSelectedIds, sourceDocuments])

  const handleBatchToggleHidden = useCallback(
    async (hide: boolean) => {
      if (!onToggleSourceDocHidden || !sourceDocuments) return
      const selected = sourceDocuments.filter((d) => globalSelectedIds.has(d.id))
      for (const doc of selected) {
        await onToggleSourceDocHidden(doc.sourceDocumentId, !hide)
      }
      handleClearSelection()
      if (onAfterBatchToggle) await onAfterBatchToggle()
    },
    [
      onToggleSourceDocHidden,
      sourceDocuments,
      globalSelectedIds,
      handleClearSelection,
      onAfterBatchToggle,
    ],
  )

  const batchActionsProps: FloatingBatchActionsProps = {
    hasSelection,
    selectedCount: globalCount,
    hasTrashDocumentsSelected: hasTrashDocs,
    isSourceTab,
    selectedSourceDocsAllHidden,
    folders: allFolders,
    statuses,
    operations: {
      isMerging: false,
      isCompressing,
      isCheckingBatch: false,
      isExportingToDisk: false,
      mergeProgress: null,
      compressProgress,
      exportProgress: null,
    },
    permissions: {
      canBatchCheck: canUseAi && !isSourceTab,
      canCompress: hasPermission('documents', 'compress_pdf') && !isSourceTab,
      canMove: isSourceTab && !!onBatchMoveSource,
      canDelete: canDeleteDocuments && !isSourceTab,
      canDownload: canDownloadDocuments,
    },
    handlers: {
      onClearSelection: handleClearSelection,
      onBatchCheck: () => {},
      onMerge: handleMerge,
      onBatchCompress: handleBatchCompress,
      onBatchMove: onBatchMoveSource ?? (() => {}),
      onBatchDelete: handleBatchDelete,
      onBatchHardDelete: hasTrashDocs ? handleBatchHardDelete : undefined,
      onBatchDownload: handleBatchDownload,
      onBatchToggleHidden:
        isSourceTab && onToggleSourceDocHidden ? handleBatchToggleHidden : undefined,
      onSendToChat: canSendToChat ? handleSendToChat : undefined,
    },
  }

  const downloadDialogProps = useMemo(() => {
    const totalSize = selectedDocs.reduce((sum, doc) => {
      const currentFile = getCurrentDocumentFile(doc.document_files)
      return sum + (currentFile?.file_size ?? 0)
    }, 0)
    const hasFolders = selectedDocs.some((d) => d.folder_id != null)
    return {
      open: downloadDialogOpen,
      onOpenChange: setDownloadDialogOpen,
      docCount: selectedDocs.length,
      totalSize,
      hasFolders,
      isDownloading,
      onConfirm: handleBatchDownloadConfirm,
    }
  }, [downloadDialogOpen, selectedDocs, isDownloading, handleBatchDownloadConfirm])

  return {
    batchActionsProps,
    isProcessing: isDownloading,
    batchDeleteConfirmProps,
    batchHardDeleteConfirmProps,
    downloadDialogProps,
  }
}
