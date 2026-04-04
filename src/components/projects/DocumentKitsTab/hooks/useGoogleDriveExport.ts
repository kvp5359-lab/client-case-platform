"use client"

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useErrorHandler } from '@/hooks/shared/useErrorHandler'
import { extractGoogleDriveFolderId } from '@/utils/googleDrive'
import {
  exportDocuments,
  subscribeToExportProgress as subscribeToExportProgressService,
  cleanupExportProgress,
} from '@/services/api/googleDriveService'
import type { DocumentWithFiles } from '@/components/documents'
import type { ExportDocument } from '../dialogs/ExportProgressDialog'
import type { RealtimeChannel } from '@supabase/supabase-js'

// === ТИПЫ ===

interface ExportResultItem {
  success: boolean
  document_id: string
  error?: string
}

interface DocumentToExport {
  document_id: string
  file_path: string
  file_name: string
  mime_type: string
  folder_name?: string
}

interface FolderInfo {
  id: string
  name: string
  sort_order?: number | null
}

interface UseGoogleDriveExportProps {
  workspaceId: string
  clearSelection: () => void
  setExportPhase: (phase: 'idle' | 'cleaning' | 'uploading' | 'completed') => void
  setExportDocuments: (documents: ExportDocument[]) => void
  updateExportDocumentStatus: (
    documentId: string,
    status: ExportDocument['status'],
    progress?: number,
    error?: string,
  ) => void
  setExportCleaningProgress: (progress: number) => void
  openExportProgressDialog: () => void
  closeExportProgressDialog: () => void
}

// Re-export для обратной совместимости
export const parseGoogleDriveFolderId = extractGoogleDriveFolderId

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

/**
 * Подготавливает документы для экспорта: сортирует и форматирует
 */
function prepareDocumentsForExport(
  selectedDocuments: Set<string>,
  kitDocuments: DocumentWithFiles[] | undefined,
  folders: FolderInfo[],
): DocumentToExport[] {
  const documentIds = Array.from(selectedDocuments)
  const selectedDocs = kitDocuments?.filter((doc) => documentIds.includes(doc.id)) || []
  const folderMap = new Map(folders.map((f) => [f.id, f]))

  // Сортируем по папкам, затем по порядку
  const sortedDocs = [...selectedDocs].sort((a, b) => {
    const folderA = a.folder_id ? folderMap.get(a.folder_id) : null
    const folderB = b.folder_id ? folderMap.get(b.folder_id) : null

    const orderA = folderA?.sort_order ?? 999999
    const orderB = folderB?.sort_order ?? 999999

    if (orderA !== orderB) {
      return orderA - orderB
    }

    return selectedDocs.indexOf(a) - selectedDocs.indexOf(b)
  })

  return sortedDocs
    .map((doc) => {
      const currentFile = doc.document_files?.find((f) => f.is_current) || doc.document_files?.[0]
      const folder = doc.folder_id ? folderMap.get(doc.folder_id) : null

      // Формируем название папки с номером
      let folderName: string | undefined = undefined
      if (folder?.name) {
        if (folder.sort_order !== null && folder.sort_order !== undefined) {
          folderName = `${folder.sort_order + 1}. ${folder.name}`
        } else {
          folderName = folder.name
        }
      }

      return {
        document_id: doc.id,
        file_path: currentFile?.file_path || '',
        file_name: currentFile?.file_name || doc.name,
        mime_type: currentFile?.mime_type || 'application/octet-stream',
        folder_name: folderName,
      }
    })
    .filter((doc) => doc.file_path)
}

/**
 * Создаёт Realtime подписку для отслеживания прогресса (через googleDriveService)
 */
function subscribeToExportProgress(
  sessionId: string,
  updateExportDocumentStatus: UseGoogleDriveExportProps['updateExportDocumentStatus'],
): RealtimeChannel | null {
  return subscribeToExportProgressService(sessionId, (payload) => {
    updateExportDocumentStatus(
      payload.document_id,
      payload.status,
      undefined,
      payload.error_message || undefined,
    )
  })
}

/**
 * Очищает записи прогресса после завершения экспорта (через googleDriveService)
 */
async function cleanupProgressRecords(sessionId: string): Promise<void> {
  await cleanupExportProgress(sessionId)
}

// === КОНСТАНТЫ ===

const EXPORT_COMPLETE_DELAY = 2000
const PHASE_TRANSITION_DELAY = 300

// === ОСНОВНОЙ ХУК ===

export function useGoogleDriveExport({
  workspaceId,
  clearSelection,
  setExportPhase,
  setExportDocuments,
  updateExportDocumentStatus,
  setExportCleaningProgress,
  openExportProgressDialog,
  closeExportProgressDialog,
}: UseGoogleDriveExportProps) {
  const { handleError } = useErrorHandler()
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Очистка таймера при unmount
  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current)
      }
    }
  }, [])

  /**
   * Основная функция выгрузки документов на Google Диск
   */
  const handleExportToGoogleDrive = async (
    googleDriveFolderLink: string,
    syncMode: 'replace_all' | 'add_only' | 'replace_existing',
    selectedDocuments: Set<string>,
    kitDocuments: DocumentWithFiles[] | undefined,
    folders: FolderInfo[],
    setExporting: (value: boolean, progress?: { current: number; total: number } | null) => void,
    setGoogleDriveFolderLink: (link: string) => void,
    closeExportDialog: () => void,
  ) => {
    // Валидация ссылки
    if (!googleDriveFolderLink.trim()) {
      toast.warning('Введите ссылку на папку Google Диска')
      return
    }

    const folderId = parseGoogleDriveFolderId(googleDriveFolderLink)
    if (!folderId) {
      toast.error('Неверный формат ссылки на папку Google Диска')
      return
    }

    // Подготовка документов
    const documentsToExport = prepareDocumentsForExport(selectedDocuments, kitDocuments, folders)
    if (documentsToExport.length === 0) {
      toast.warning('Не найдено документов с файлами для выгрузки')
      return
    }

    // Генерируем ID сессии
    const sessionId = `export-${Date.now()}-${Math.random().toString(36).substring(7)}`

    let realtimeChannel: RealtimeChannel | null = null
    try {
      // Начинаем экспорт
      setExporting(true)
      closeExportDialog()

      // Инициализация UI прогресса
      const exportDocs: ExportDocument[] = documentsToExport.map((doc) => ({
        documentId: doc.document_id,
        fileName: doc.file_name,
        folderName: doc.folder_name,
        status: 'pending' as const,
      }))
      setExportDocuments(exportDocs)

      // Показываем диалог прогресса
      if (syncMode === 'replace_all') {
        setExportPhase('cleaning')
        setExportCleaningProgress(50)
      } else {
        setExportPhase('uploading')
      }
      openExportProgressDialog()
      setExporting(true, { current: 0, total: documentsToExport.length })

      // Плавный переход к фазе загрузки
      if (syncMode === 'replace_all') {
        setExportCleaningProgress(100)
        await new Promise((resolve) => setTimeout(resolve, PHASE_TRANSITION_DELAY))
      }
      setExportPhase('uploading')

      // Подписка на Realtime обновления
      realtimeChannel = subscribeToExportProgress(sessionId, updateExportDocumentStatus)

      // Отправка запроса на экспорт через сервис
      const result = await exportDocuments({
        folderId,
        syncMode,
        sessionId,
        workspaceId,
        documents: documentsToExport,
      })

      // Отписка от канала
      if (realtimeChannel) {
        await supabase.removeChannel(realtimeChannel)
      }

      // Обновляем финальные статусы из результата
      if (result.results) {
        for (const resultItem of result.results as ExportResultItem[]) {
          updateExportDocumentStatus(
            resultItem.document_id,
            resultItem.success ? 'success' : 'error',
            undefined,
            resultItem.error,
          )
        }
      }

      // Завершение
      setExporting(true, { current: documentsToExport.length, total: documentsToExport.length })
      setExportPhase('completed')

      const successCount = result.success_count || 0
      const errorCount = documentsToExport.length - successCount

      // Автозакрытие при успехе
      if (errorCount === 0) {
        if (autoCloseTimerRef.current) {
          clearTimeout(autoCloseTimerRef.current)
        }
        autoCloseTimerRef.current = setTimeout(() => {
          autoCloseTimerRef.current = null
          closeExportProgressDialog()
          clearSelection()
          setGoogleDriveFolderLink('')
        }, EXPORT_COMPLETE_DELAY)
      }
    } catch (error) {
      setExportPhase('completed')
      handleError(error, 'Ошибка при выгрузке документов')
    } finally {
      if (realtimeChannel) {
        await supabase.removeChannel(realtimeChannel).catch(() => {})
      }
      setExporting(false, null)
      await cleanupProgressRecords(sessionId)
    }
  }

  return {
    handleExportToGoogleDrive,
    parseGoogleDriveFolderId,
  }
}
