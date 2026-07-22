import { useState, useCallback, useEffect, useRef, type DragEvent } from 'react'
import { toast } from 'sonner'
import { loadDraftFiles, saveDraftFiles, clearDraftFiles } from './useDraftFiles'
import type { MessageAttachment } from '@/services/api/messenger/messengerService'
import {
  getThreadDraftFiles,
  addThreadDraftFile,
  removeThreadDraftFile,
  clearThreadDraftFilesWithStorage,
  type ThreadDraftFile,
} from '@/services/api/messenger/threadDraftService'
import { downloadFromStorage, STORAGE_BUCKETS } from '@/lib/storage'
import { notifyDraftChanged } from './draftChangeBus'
import { logger } from '@/utils/logger'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

/**
 * Файлы композера.
 *
 * Локально файлы живут в IndexedDB (мгновенно, офлайн). Когда известны тред и
 * пользователь, они ЗЕРКАЛЯТСЯ на сервер (thread_input_draft_files) — чтобы
 * черновик с вложениями открывался на другом устройстве.
 *
 * Путь ОТПРАВКИ намеренно не трогаем: наверх по-прежнему уходят обычные File, и
 * отправка работает ровно как раньше. Цена — файл, прикреплённый на одном
 * устройстве и отправленный с другого, загрузится дважды (черновик + отправка).
 * Это осознанный размен: отправка вложений — самое инцидентоопасное место
 * проекта, лезть в неё ради экономии трафика не стоит.
 */
export function useMessageFiles(
  draftKey: string,
  addFilesRef?: React.MutableRefObject<((files: File[]) => void) | null>,
  onDocumentDrop?: (documentId: string) => void,
  /** Вызывается после успешного добавления хотя бы одного файла — используется
   *  для возврата фокуса в редактор после прикрепления. */
  onFilesAdded?: () => void,
  threadId?: string | null,
  userId?: string | null,
  workspaceId?: string | null,
) {
  const [files, setFiles] = useState<File[]>([])
  const syncEnabled = !!threadId && !!userId && !!workspaceId
  // File → строка серверного черновика. WeakMap, потому что ключ — те же самые
  // объекты File, что лежат в state; при удалении файла из state запись уходит.
  const syncedRef = useRef(new WeakMap<File, ThreadDraftFile>())
  /** Existing server-side attachments (for draft editing — no re-download needed) */
  const [existingAttachments, setExistingAttachments] = useState<MessageAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)

  // Restore files from IndexedDB on mount / channel switch
  useEffect(() => {
    let cancelled = false
    loadDraftFiles(draftKey).then(async (saved) => {
      if (cancelled) return
      setFiles(saved.length > 0 ? saved : [])
      // Clear existing attachments when switching channel/project
      setExistingAttachments([])

      // Локально пусто, а на сервере файлы есть → черновик пришёл с другого
      // устройства: скачиваем и показываем как обычные вложения.
      if (!syncEnabled || saved.length > 0) return
      try {
        const remote = await getThreadDraftFiles(threadId!, userId!)
        if (cancelled || remote.length === 0) return
        const restored: File[] = []
        for (const r of remote) {
          const { data, error } = await downloadFromStorage(STORAGE_BUCKETS.files, r.storagePath)
          if (error || !data) continue
          const file = new File([data], r.fileName, { type: r.mimeType })
          syncedRef.current.set(file, r) // уже на сервере — повторно не заливаем
          restored.push(file)
        }
        if (cancelled || restored.length === 0) return
        setFiles(restored)
        saveDraftFiles(draftKey, restored)
      } catch (e) {
        logger.error('Не удалось получить файлы черновика с сервера:', e)
      }
    })
    return () => {
      cancelled = true
    }
  }, [draftKey, syncEnabled, threadId, userId])

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      const all = Array.from(newFiles)
      const tooBig = all.filter((f) => f.size > MAX_FILE_SIZE)
      if (tooBig.length > 0) {
        toast.warning(
          tooBig.length === 1
            ? `Файл "${tooBig[0].name}" слишком большой (макс. 20 МБ)`
            : `${tooBig.length} файл(а/ов) слишком большие (макс. 20 МБ)`,
        )
      }
      const arr = all.filter((f) => f.size <= MAX_FILE_SIZE)
      if (arr.length > 0) {
        setFiles((prev) => {
          const next = [...prev, ...arr]
          saveDraftFiles(draftKey, next)
          return next
        })
        onFilesAdded?.()
        // Зеркалим на сервер — чтобы файл увидели с другого устройства.
        if (syncEnabled) {
          void Promise.all(
            arr.map((file, i) =>
              addThreadDraftFile(file, threadId!, userId!, workspaceId!, i).then((row) =>
                syncedRef.current.set(file, row),
              ),
            ),
          )
            .then(() => notifyDraftChanged(threadId!))
            .catch((e) => logger.error('Не удалось сохранить файл черновика на сервере:', e))
        }
      }
    },
    [draftKey, onFilesAdded, syncEnabled, threadId, userId, workspaceId],
  )

  const removeFile = useCallback(
    (index: number) => {
      setFiles((prev) => {
        const removed = prev[index]
        const next = prev.filter((_, i) => i !== index)
        saveDraftFiles(draftKey, next)
        const row = removed ? syncedRef.current.get(removed) : undefined
        if (row) {
          removeThreadDraftFile(row)
            .then(() => notifyDraftChanged(threadId ?? undefined))
            .catch((e) => logger.error('Не удалось удалить файл черновика на сервере:', e))
        }
        return next
      })
    },
    [draftKey, threadId],
  )

  const removeExistingAttachment = useCallback((index: number) => {
    setExistingAttachments((prev) => prev.filter((_, i) => i !== index))
  }, [])

  /** Load existing attachments from a draft message (no download — just references) */
  const loadExistingAttachments = useCallback((attachments: MessageAttachment[]) => {
    setExistingAttachments(attachments)
  }, [])

  const clearFiles = useCallback(() => {
    setFiles([])
    setExistingAttachments([])
    clearDraftFiles(draftKey)
    // Отправили/сбросили — серверная копия черновика больше не нужна. Удаляем и
    // сами объекты: отправленное сообщение загрузило собственные копии.
    if (syncEnabled) {
      clearThreadDraftFilesWithStorage(threadId!, userId!)
        .then(() => notifyDraftChanged(threadId!))
        .catch((e) => logger.error('Не удалось очистить файлы черновика на сервере:', e))
    }
  }, [draftKey, syncEnabled, threadId, userId])

  // Register addFiles for parent to call (project documents)
  useEffect(() => {
    if (addFilesRef) addFilesRef.current = addFiles
    return () => {
      if (addFilesRef) addFilesRef.current = null
    }
  }, [addFilesRef, addFiles])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const docId = e.dataTransfer.getData('application/x-document-id')
      if (docId && onDocumentDrop) {
        onDocumentDrop(docId)
        return
      }
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files)
      }
    },
    [addFiles, onDocumentDrop],
  )

  return {
    files,
    existingAttachments,
    isDragging,
    addFiles,
    removeFile,
    removeExistingAttachment,
    loadExistingAttachments,
    clearFiles,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  }
}
