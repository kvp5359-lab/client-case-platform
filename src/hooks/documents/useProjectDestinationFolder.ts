"use client"

/**
 * Хук для работы с папкой назначения на Google Drive (project-level).
 *
 * Данные destinationDocuments теперь в React Query (useDestinationDocumentsQuery).
 * Этот хук предоставляет мутации: экспорт, загрузка состава, открытие в Drive.
 */

import { useRef } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { logger } from '@/utils/logger'
import { exportToDestination } from '@/services/api/googleDriveService'
import { googleDriveKeys } from '@/hooks/queryKeys'

interface UseProjectDestinationFolderProps {
  projectId: string
  exportFolderId: string | null | undefined
  workspaceId: string
  setExporting: (exporting: boolean) => void
  setFetchingDestination: (fetching: boolean) => void
  setHasExported: (hasExported: boolean) => void
  setExportPhase: (phase: 'idle' | 'cleaning' | 'uploading' | 'completed') => void
}

export function useProjectDestinationFolder({
  projectId,
  exportFolderId,
  workspaceId,
  setExporting,
  setFetchingDestination,
  setHasExported,
  setExportPhase,
}: UseProjectDestinationFolderProps) {
  const isExportInProgress = useRef(false)
  const queryClient = useQueryClient()

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
      // Инвалидируем + refetch через React Query
      await queryClient.refetchQueries({
        queryKey: googleDriveKeys.destinationDocuments(exportFolderId, workspaceId),
      })
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
