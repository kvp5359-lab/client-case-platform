"use client"

import { useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import {
  getSourceDocumentsByProject,
  toggleSourceDocumentHidden as toggleHidden,
  toggleSourceFolderHidden,
  syncSourceDocumentsFromDrive,
  getGoogleDriveToken,
  refreshGoogleDriveTokenIfNeeded,
  downloadGoogleDriveFile,
} from '@/services/documents/sourceDocumentService'
import type { SourceDocument } from '@/components/documents/types'

interface UseProjectSourceDocumentsProps {
  projectId: string
  sourceFolderId: string | null | undefined
  workspaceId: string
  showHiddenSourceDocs: boolean
  setSourceDocuments: (docs: SourceDocument[]) => void
  setSyncing: (value: boolean) => void
  setSystemSectionTab: (tab: 'unassigned' | 'destination' | 'trash') => void
  setSourceCollapsed: (collapsed: boolean) => void
  setSourceFolderName?: (name: string) => void
}

export function useProjectSourceDocuments({
  projectId,
  sourceFolderId,
  workspaceId,
  showHiddenSourceDocs,
  setSourceDocuments,
  setSyncing,
  setSystemSectionTab,
  setSourceCollapsed,
  setSourceFolderName,
}: UseProjectSourceDocumentsProps) {
  // requestId prevents stale responses from overwriting fresh data
  const loadRequestIdRef = useRef(0)

  // B-151: ref prevents stale closure — loadSourceDocuments always reads the latest value
  const showHiddenRef = useRef(showHiddenSourceDocs)
  showHiddenRef.current = showHiddenSourceDocs

  const loadSourceDocuments = useCallback(async () => {
    if (!projectId) return
    const requestId = ++loadRequestIdRef.current

    try {
      const { documents: sourceDocs, usedSourceIds } = await getSourceDocumentsByProject(projectId)

      // Stale response — a newer load was triggered while this one was in-flight
      if (requestId !== loadRequestIdRef.current) return

      let availableDocs = sourceDocs.filter((doc) => !usedSourceIds.has(doc.id))

      if (!showHiddenRef.current) {
        availableDocs = availableDocs.filter((doc) => !doc.is_hidden)
      }

      const formattedDocs: SourceDocument[] = availableDocs.map((doc) => ({
        id: doc.google_drive_file_id,
        name: doc.name,
        mimeType: doc.mime_type || '',
        size: doc.file_size || undefined,
        createdTime: doc.created_time || undefined,
        modifiedTime: doc.modified_time || undefined,
        webViewLink: doc.web_view_link || undefined,
        iconLink: doc.icon_link || undefined,
        parentFolderName: doc.parent_folder_name || undefined,
        sourceDocumentId: doc.id,
        isHidden: doc.is_hidden || undefined,
      }))

      setSourceDocuments(formattedDocs)
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return
      logger.error('Ошибка загрузки исходных документов:', error)
    }
  }, [projectId, setSourceDocuments])

  useEffect(() => {
    loadSourceDocuments()
  }, [loadSourceDocuments])

  // B-151: reload when toggle changes (ref keeps value fresh, effect triggers reload)
  useEffect(() => {
    loadSourceDocuments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHiddenSourceDocs])

  const cleanupTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  useEffect(() => {
    // Локальный снимок ref'а — чтобы cleanup работал именно с тем Set таймеров,
    // что был на момент монтирования (react-hooks/exhaustive-deps требование).
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
      await loadSourceDocuments()
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
      await loadSourceDocuments()
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

      await loadSourceDocuments()
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
