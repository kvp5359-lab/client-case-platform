"use client"

/**
 * Drag & Drop, Merge и Source обработчики для DocumentKit.
 * Вынесены из useDocumentKitHandlers для декомпозиции.
 */

/* eslint-disable react-hooks/preserve-manual-memoization -- latestRef pattern: ref is stable, empty deps intentional */

import React, { useCallback } from 'react'
import type { DocumentWithFiles } from '@/components/documents/types'
import type { LatestHandlersRef } from './documentKitHandlerTypes'

type LatestRef = LatestHandlersRef

export function useDocumentKitDragDropHandlers(latestRef: LatestRef) {
  // === DRAG & DROP ===

  const handleDocDrop = useCallback(async (e: React.DragEvent, targetDoc: DocumentWithFiles) => {
    const r = latestRef.current
    e.preventDefault()
    // Если тащат source doc — загружаем его в папку целевого документа
    const isSourceDoc = e.dataTransfer.getData('application/x-source-doc') === 'true'
    if (isSourceDoc) {
      const json = e.dataTransfer.getData('application/x-source-doc-json')
      const sourceDoc =
        r.draggedSourceDoc ||
        (json
          ? (() => {
              try {
                return JSON.parse(json)
              } catch {
                return null
              }
            })()
          : null)
      if (sourceDoc) {
        r.setSyncing(true)
        await r.sourceUpload.uploadSourceDocumentSilent(sourceDoc, targetDoc.folder_id)
        r.setSyncing(false)
        r.resetDragState()
      }
      return
    }
    // Fallback: при cross-kit drag draggedDocId может быть null
    const docId = r.draggedDocId || e.dataTransfer.getData('application/x-document-id') || null
    await r.batchMoveOps.handleDocumentDrop(
      r.kit,
      docId,
      targetDoc,
      r.dragOverPosition,
      r.resetDragState,
    )
  }, [])

  const handleFolderDrop = useCallback(
    async (e: React.DragEvent, targetFolderId: string | null) => {
      const r = latestRef.current
      e.preventDefault()

      // Конвертируем 'unassigned' в null для БД
      const normalizedFolderId = targetFolderId === 'unassigned' ? null : targetFolderId

      // Проверяем source doc — из state или из dataTransfer (fallback при stale closure)
      const isSourceDoc = e.dataTransfer.getData('application/x-source-doc') === 'true'
      const sourceDoc =
        r.draggedSourceDoc ||
        (isSourceDoc
          ? (() => {
              const json = e.dataTransfer.getData('application/x-source-doc-json')
              if (!json) return null
              try {
                return JSON.parse(json)
              } catch {
                return null
              }
            })()
          : null)

      if (sourceDoc) {
        r.setSyncing(true)
        await r.sourceUpload.uploadSourceDocumentSilent(sourceDoc, normalizedFolderId)
        r.setSyncing(false)
        r.resetDragState()
        return
      }
      // Fallback: при cross-kit drag draggedDocId в текущем ките = null,
      // но ID сохранён в dataTransfer
      const docId = r.draggedDocId || e.dataTransfer.getData('application/x-document-id') || null
      await r.batchMoveOps.handleFolderDrop(r.kit, docId, normalizedFolderId, r.resetDragState)
    },
    [],
  )

  // === СЛИЯНИЕ ===

  const handleOpenMergeDialog = useCallback(() => {
    const r = latestRef.current
    r.documentMerge.handleOpenMergeDialog(r.kit, r.selectedDocuments)
  }, [])

  const handleMergeDocuments = useCallback(() => {
    const r = latestRef.current
    if (!r.kit) return
    r.documentMerge.handleMergeDocuments({
      documentKitId: r.kit.id,
      allDocuments: r.kit.documents ?? [],
    })
  }, [])

  const handleGenerateMergeName = useCallback(() => {
    const r = latestRef.current
    if (!r.kit) return
    const selectedDocs = r.mergeDocsList
      .map((item: { id: string }) =>
        r.kit?.documents?.find((d: { id: string }) => d.id === item.id),
      )
      .filter((d: unknown): d is NonNullable<typeof d> => d !== undefined)
    r.documentMerge.generateMergeNameWithAI(selectedDocs)
  }, [])

  // === ИСТОЧНИК ===

  const handleConnectSource = useCallback(async () => {
    const r = latestRef.current
    await r.sourceConnection.connectSource(r.sourceFolderLink, {
      closeDialog: r.closeConnectSourceDialog,
      setSourceFolderLink: r.setSourceFolderLink,
      setSourceConnected: r.setSourceConnected,
    })
  }, [])

  const handleSaveSourceSettings = useCallback(async () => {
    const r = latestRef.current
    await r.sourceConnection.saveSourceSettings(r.sourceFolderLink, {
      closeDialog: () => {}, // Диалог закрывается в компоненте DocumentKitSettingsDialog
      setSourceConnected: r.setSourceConnected,
    })
  }, [])

  const handleSaveExportSettings = useCallback(async () => {
    const r = latestRef.current
    await r.sourceConnection.saveExportSettings(r.googleDriveFolderLink, {
      closeDialog: () => {}, // Диалог закрывается в компоненте DocumentKitSettingsDialog
      setExportFolderConnected: r.setExportFolderConnected,
    })
  }, [])

  return {
    handleDocDrop,
    handleFolderDrop,
    handleOpenMergeDialog,
    handleMergeDocuments,
    handleGenerateMergeName,
    handleConnectSource,
    handleSaveSourceSettings,
    handleSaveExportSettings,
  }
}
