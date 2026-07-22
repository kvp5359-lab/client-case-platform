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
 * Ключ соответствия «файл в композере ↔ строка на сервере».
 *
 * Имя + размер, а НЕ сам объект File: после перезагрузки страницы файлы
 * восстанавливаются из IndexedDB новыми объектами, и связь по ссылке теряется —
 * тогда удаление файла не дошло бы до сервера (черновик остался бы висеть).
 * `lastModified` в ключ не берём: у серверной строки его нет.
 */
const fileKey = (name: string, size: number) => `${name}|${size}`

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
  // «имя|размер» → строки серверного черновика (список — на случай двух файлов с
  // одинаковым именем и размером в одном черновике; берём по одной).
  const syncedRef = useRef(new Map<string, ThreadDraftFile[]>())
  /** Existing server-side attachments (for draft editing — no re-download needed) */
  const [existingAttachments, setExistingAttachments] = useState<MessageAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)

  /** Запомнить серверную строку файла. */
  const putSynced = useCallback((name: string, size: number, row: ThreadDraftFile) => {
    const key = fileKey(name, size)
    const list = syncedRef.current.get(key)
    if (list) list.push(row)
    else syncedRef.current.set(key, [row])
  }, [])

  /** Забрать серверную строку файла (одноразово — файл уходит из черновика). */
  const takeSynced = useCallback((file: File): ThreadDraftFile | undefined => {
    const key = fileKey(file.name, file.size)
    const list = syncedRef.current.get(key)
    const row = list?.pop()
    if (list && list.length === 0) syncedRef.current.delete(key)
    return row
  }, [])

  // Restore files from IndexedDB on mount / channel switch
  useEffect(() => {
    let cancelled = false
    syncedRef.current = new Map()
    loadDraftFiles(draftKey).then(async (saved) => {
      if (cancelled) return
      setFiles(saved.length > 0 ? saved : [])
      // Clear existing attachments when switching channel/project
      setExistingAttachments([])

      if (!syncEnabled) return
      try {
        const remote = await getThreadDraftFiles(threadId!, userId!)
        if (cancelled || remote.length === 0) return
        // Связь «файл ↔ серверная строка» восстанавливаем ВСЕГДА, даже когда
        // локальные файлы уже есть: иначе после перезагрузки страницы удаление
        // файла не дошло бы до сервера и черновик завис бы навсегда.
        for (const r of remote) putSynced(r.fileName, r.fileSize, r)
        // Локально пусто, а на сервере файлы есть → черновик пришёл с другого
        // устройства: скачиваем и показываем как обычные вложения.
        if (saved.length > 0) return
        const restored = (
          await Promise.all(
            remote.map(async (r) => {
              const { data, error } = await downloadFromStorage(
                STORAGE_BUCKETS.files,
                r.storagePath,
              )
              return error || !data ? null : new File([data], r.fileName, { type: r.mimeType })
            }),
          )
        ).filter((f): f is File => !!f)
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
  }, [draftKey, putSynced, syncEnabled, threadId, userId])

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
        // Побочные эффекты (IndexedDB, сеть) держим ВНЕ апдейтера setFiles —
        // апдейтер обязан быть чистым, иначе в StrictMode он выполнится дважды.
        const next = [...files, ...arr]
        setFiles(next)
        saveDraftFiles(draftKey, next)
        onFilesAdded?.()
        // Зеркалим на сервер — чтобы файл увидели с другого устройства.
        if (syncEnabled) {
          void Promise.all(
            arr.map((file, i) =>
              addThreadDraftFile(file, threadId!, userId!, workspaceId!, i).then((row) =>
                putSynced(file.name, file.size, row),
              ),
            ),
          )
            .then(() => notifyDraftChanged(threadId!))
            .catch((e) => logger.error('Не удалось сохранить файл черновика на сервере:', e))
        }
      }
    },
    [draftKey, files, onFilesAdded, putSynced, syncEnabled, threadId, userId, workspaceId],
  )

  const removeFile = useCallback(
    (index: number) => {
      const removed = files[index]
      if (!removed) return
      const next = files.filter((_, i) => i !== index)
      setFiles(next)
      saveDraftFiles(draftKey, next)
      const row = takeSynced(removed)
      if (row) {
        removeThreadDraftFile(row)
          .then(() => notifyDraftChanged(threadId ?? undefined))
          .catch((e) => logger.error('Не удалось удалить файл черновика на сервере:', e))
      }
    },
    [draftKey, files, takeSynced, threadId],
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
    syncedRef.current = new Map()
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
