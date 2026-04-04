import { useState, useCallback, useEffect, type DragEvent } from 'react'
import { toast } from 'sonner'
import { loadDraftFiles, saveDraftFiles, clearDraftFiles } from './useDraftFiles'
import type { MessageAttachment } from '@/services/api/messengerService'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

export function useMessageFiles(
  draftKey: string,
  addFilesRef?: React.MutableRefObject<((files: File[]) => void) | null>,
  onDocumentDrop?: (documentId: string) => void,
) {
  const [files, setFiles] = useState<File[]>([])
  /** Existing server-side attachments (for draft editing — no re-download needed) */
  const [existingAttachments, setExistingAttachments] = useState<MessageAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)

  // Restore files from IndexedDB on mount / channel switch
  useEffect(() => {
    let cancelled = false
    loadDraftFiles(draftKey).then((saved) => {
      if (!cancelled) {
        setFiles(saved.length > 0 ? saved : [])
        // Clear existing attachments when switching channel/project
        setExistingAttachments([])
      }
    })
    return () => {
      cancelled = true
    }
  }, [draftKey])

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
      }
    },
    [draftKey],
  )

  const removeFile = useCallback(
    (index: number) => {
      setFiles((prev) => {
        const next = prev.filter((_, i) => i !== index)
        saveDraftFiles(draftKey, next)
        return next
      })
    },
    [draftKey],
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
  }, [draftKey])

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
