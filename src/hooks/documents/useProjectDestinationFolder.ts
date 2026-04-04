"use client"

/**
 * Хук для работы с папкой назначения на Google Drive (project-level)
 */

import { useRef } from 'react'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { exportToDestination, listFiles } from '@/services/api/googleDriveService'
import { DestinationDocument } from '@/components/documents/types'

interface UseProjectDestinationFolderProps {
  projectId: string
  exportFolderId: string | null | undefined
  workspaceId: string
  setDestinationDocuments: (docs: DestinationDocument[]) => void
  setExporting: (exporting: boolean) => void
  setFetchingDestination: (fetching: boolean) => void
  setHasExported: (hasExported: boolean) => void
  setExportPhase: (phase: 'idle' | 'cleaning' | 'uploading' | 'completed') => void
}

export function useProjectDestinationFolder({
  projectId,
  exportFolderId,
  workspaceId,
  setDestinationDocuments,
  setExporting,
  setFetchingDestination,
  setHasExported,
  setExportPhase,
}: UseProjectDestinationFolderProps) {
  const isExportInProgress = useRef(false)

  const handleExportToDestination = async () => {
    if (!exportFolderId) {
      toast.error(
        'Папка назначения не подключена. Откройте настройки и подключите папку назначения.',
      )
      return
    }

    if (isExportInProgress.current) return
    isExportInProgress.current = true
    setExporting(true)
    setExportPhase('cleaning')
    try {
      setExportPhase('uploading')

      const result = await exportToDestination({
        projectId,
        workspaceId,
        exportFolderId,
      })

      setExportPhase('completed')
      // Задержка чтобы пользователь увидел фазу "completed" в UI перед сменой на idle
      await new Promise((resolve) => setTimeout(resolve, 1500))

      const stats = []
      if (result.deleted > 0) stats.push(`Очищено: ${result.deleted}`)
      if (result.folders > 0) stats.push(`Папок: ${result.folders}`)
      if (result.files > 0) stats.push(`Файлов: ${result.files}`)

      const message =
        stats.length > 0
          ? `Синхронизация завершена!\n\n${stats.join('\n')}\n\nВсего создано: ${result.created || 0}`
          : 'Синхронизация завершена!'

      toast.success(message)

      setHasExported(true)
      await handleFetchDestination()
    } catch (error) {
      logger.error('Ошибка экспорта:', error)
      toast.error(
        `Ошибка экспорта: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
      )
    } finally {
      setExporting(false)
      setExportPhase('idle')
      isExportInProgress.current = false
    }
  }

  const handleFetchDestination = async () => {
    if (!exportFolderId) {
      toast.error('Папка назначения не подключена')
      return
    }

    setFetchingDestination(true)

    try {
      const files = await listFiles(exportFolderId, workspaceId)

      const destinationDocs: DestinationDocument[] = files.map((file) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size ? parseInt(file.size) : undefined,
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        webViewLink: file.webViewLink,
        iconLink: file.iconLink,
        parentFolderName: file.parentFolderName,
      }))

      destinationDocs.sort((a, b) => {
        const folderA = a.parentFolderName || ''
        const folderB = b.parentFolderName || ''

        if (folderA !== folderB) {
          return folderA.localeCompare(folderB, 'ru')
        }

        return a.name.localeCompare(b.name, 'ru')
      })

      setDestinationDocuments(destinationDocs)
      setHasExported(true)
    } catch (error) {
      logger.error('Ошибка получения состава:', error)
      toast.error(
        `Ошибка получения состава папки: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
      )
    } finally {
      setFetchingDestination(false)
    }
  }

  const handleOpenDestinationInDrive = () => {
    if (!exportFolderId) {
      toast.error('Папка назначения не подключена')
      return
    }

    const driveUrl = `https://drive.google.com/drive/folders/${exportFolderId}`
    window.open(driveUrl, '_blank')
  }

  return {
    handleExportToDestination,
    handleFetchDestination,
    handleOpenDestinationInDrive,
  }
}
