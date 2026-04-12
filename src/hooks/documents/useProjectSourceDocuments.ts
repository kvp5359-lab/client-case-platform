"use client"

import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import {
  toggleSourceDocumentHidden as toggleHidden,
  toggleSourceFolderHidden,
  syncSourceDocumentsFromDrive,
  getGoogleDriveToken,
  refreshGoogleDriveTokenIfNeeded,
  downloadGoogleDriveFile,
} from '@/services/documents/sourceDocumentService'
import { useInvalidateSourceDocuments } from './useSourceDocumentsQuery'
import type { SourceDocument } from '@/components/documents/types'

interface UseProjectSourceDocumentsProps {
  projectId: string
  sourceFolderId: string | null | undefined
  workspaceId: string
  setSyncing: (value: boolean) => void
  setSystemSectionTab: (tab: 'unassigned' | 'source' | 'destination' | 'trash') => void
  setSourceCollapsed: (collapsed: boolean) => void
  setSourceFolderName?: (name: string) => void
}

export function useProjectSourceDocuments({
  projectId,
  sourceFolderId,
  workspaceId,
  setSyncing,
  setSystemSectionTab,
  setSourceCollapsed,
  setSourceFolderName,
}: UseProjectSourceDocumentsProps) {
  const invalidateSourceDocuments = useInvalidateSourceDocuments()

  /**
   * Инвалидирует кэш source documents — React Query автоматически перезагрузит данные.
   * Используется в тех местах, где раньше вызывался loadSourceDocuments().
   */
  const loadSourceDocuments = useCallback(async () => {
    if (!projectId) return
    await invalidateSourceDocuments(projectId)
  }, [projectId, invalidateSourceDocuments])

  const cleanupTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  useEffect(() => {
    const timers = cleanupTimersRef.current
    return () => {
      for (const timer of timers) {
        clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  const isTogglingRef = useRef(false)

  const toggleSourceDocumentHidden = async (sourceDocId: string, currentHiddenState: boolean) => {
    if (isTogglingRef.current) return
    isTogglingRef.current = true
    try {
      await toggleHidden(sourceDocId, currentHiddenState)
      await invalidateSourceDocuments(projectId)
    } catch (err) {
      logger.error('toggleSourceDocumentHidden failed:', err)
      toast.error('Не удалось изменить видимость документа')
    } finally {
      isTogglingRef.current = false
    }
  }

  const handleToggleFolderHidden = async (folderName: string, hide: boolean) => {
    if (isTogglingRef.current) return
    isTogglingRef.current = true
    try {
      await toggleSourceFolderHidden(projectId, folderName, hide)
      await invalidateSourceDocuments(projectId)
      toast.success(hide ? 'Папка скрыта' : 'Папка показана')
    } catch (err) {
      logger.error('handleToggleFolderHidden failed:', err)
      toast.error('Не удалось изменить видимость папки')
    } finally {
      isTogglingRef.current = false
    }
  }

  const isSyncingRef = useRef(false)

  const handleSyncSource = async () => {
    if (!sourceFolderId) {
      toast.error('Источник не подключен. Подключите папку Google Drive через кнопку настроек.')
      return
    }
    if (isSyncingRef.current) return
    isSyncingRef.current = true

    try {
      setSyncing(true)

      const result = await syncSourceDocumentsFromDrive({
        projectId,
        workspaceId,
        sourceFolderId,
      })

      if (result.folderName) {
        setSourceFolderName?.(result.folderName)
      }

      await invalidateSourceDocuments(projectId)
      setSystemSectionTab('unassigned')
      setSourceCollapsed(false)

      let description = `Найдено файлов: ${result.filesFound}`
      if (result.deleted > 0) {
        description += `. Удалено из источника: ${result.deleted}`
      }
      toast.success('Синхронизация завершена!', { description })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка при синхронизации источника')
    } finally {
      setSyncing(false)
      isSyncingRef.current = false
    }
  }

  const isDownloadingRef = useRef(false)

  const handleDownloadSourceDocument = async (file: SourceDocument) => {
    if (!file.id) {
      toast.error('Не удалось найти файл на Google Drive')
      return
    }

    if (isDownloadingRef.current) return
    isDownloadingRef.current = true

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('Не авторизован')

      const token = await getGoogleDriveToken(session.user.id)
      const accessToken = await refreshGoogleDriveTokenIfNeeded(token, session.user.id)
      const { blob, fileName } = await downloadGoogleDriveFile(file.id, accessToken)

      const url = window.URL.createObjectURL(blob)
      try {
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.target = '_blank'

        document.body.appendChild(a)

        setTimeout(() => {
          try {
            a.click()
          } catch {
            window.open(url, '_blank')
          }
        }, 0)

        const cleanupTimerId = setTimeout(() => {
          try {
            document.body.removeChild(a)
            window.URL.revokeObjectURL(url)
          } catch {
            /* cleanup error ignored */
          }
          cleanupTimersRef.current.delete(cleanupTimerId)
        }, 3000)
        cleanupTimersRef.current.add(cleanupTimerId)
      } catch {
        window.URL.revokeObjectURL(url)
        throw new Error('Не удалось инициировать скачивание')
      }

      toast.success(
        'Файл отправлен на скачивание. Проверьте папку "Загрузки" или всплывающие окна браузера.',
      )
    } catch (error) {
      toast.error(
        `Ошибка скачивания файла: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
      )
    } finally {
      isDownloadingRef.current = false
    }
  }

  return {
    loadSourceDocuments,
    toggleSourceDocumentHidden,
    handleToggleFolderHidden,
    handleSyncSource,
    handleDownloadSourceDocument,
  }
}
