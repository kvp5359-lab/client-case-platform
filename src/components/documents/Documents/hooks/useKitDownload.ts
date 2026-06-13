"use client"

/**
 * Хук для скачивания всех документов набора в ZIP
 */

import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import {
  downloadDocumentsAsZip,
  type DownloadGroupMode,
} from '@/services/documents/downloadDocumentsAsZip'
import type { DocumentKitWithDocuments } from '@/components/documents/types'
import { getCurrentDocumentFile } from '@/utils/documentUtils'

export function useKitDownload() {
  const [kitDownloadDialog, setKitDownloadDialog] = useState<{
    open: boolean
    kit: DocumentKitWithDocuments | null
    isDownloading: boolean
  }>({ open: false, kit: null, isDownloading: false })

  const handleDownloadKit = useCallback((kit: DocumentKitWithDocuments) => {
    const docs = (kit.documents || []).filter((d) => !d.is_deleted)
    if (docs.length === 0) {
      toast.warning('В наборе нет документов для скачивания')
      return
    }
    setKitDownloadDialog({ open: true, kit, isDownloading: false })
  }, [])

  const handleKitDownloadConfirm = useCallback(
    async (mode: DownloadGroupMode) => {
      const { kit } = kitDownloadDialog
      if (!kit) return
      const docs = (kit.documents || []).filter((d) => !d.is_deleted)
      setKitDownloadDialog((s) => ({ ...s, isDownloading: true }))
      try {
        await downloadDocumentsAsZip({
          docs,
          folders: kit.folders || [],
          archiveName: kit.name,
          mode,
        })
        setKitDownloadDialog({ open: false, kit: null, isDownloading: false })
      } catch (error) {
        logger.error('Ошибка скачивания набора:', error)
        toast.error(error instanceof Error ? error.message : 'Ошибка при скачивании документов')
        setKitDownloadDialog((s) => ({ ...s, isDownloading: false }))
      }
    },
    [kitDownloadDialog],
  )

  const kitDownloadDialogProps = useMemo(() => {
    const docs = (kitDownloadDialog.kit?.documents || []).filter((d) => !d.is_deleted)
    const totalSize = docs.reduce((sum, doc) => {
      const f = getCurrentDocumentFile(doc.document_files)
      return sum + (f?.file_size ?? 0)
    }, 0)
    const hasFolders = docs.some((d) => d.folder_id != null)
    return {
      open: kitDownloadDialog.open,
      onOpenChange: (open: boolean) =>
        setKitDownloadDialog((s) => ({ ...s, open, kit: open ? s.kit : null })),
      docCount: docs.length,
      totalSize,
      hasFolders,
      isDownloading: kitDownloadDialog.isDownloading,
      onConfirm: handleKitDownloadConfirm,
    }
  }, [kitDownloadDialog, handleKitDownloadConfirm])

  return {
    handleDownloadKit,
    kitDownloadDialogProps,
  }
}
