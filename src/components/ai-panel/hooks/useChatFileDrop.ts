import { useCallback, useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import type { AttachedDocument } from '@/hooks/messenger/useMessengerAi'

const MAX_CHAT_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

interface Options {
  addAttachedDocument: (doc: AttachedDocument) => void
  onDocumentDrop?: (documentId: string) => void
  onAfterDrop?: () => void
}

export function useChatFileDrop({ addAttachedDocument, onDocumentDrop, onAfterDrop }: Options) {
  const [isDragging, setIsDragging] = useState(false)

  const handleFilesSelected = useCallback(
    (fileList: File[] | FileList) => {
      const file = fileList[0]
      if (!file) return

      const isPdf = file.type === 'application/pdf'
      const isImage = file.type.startsWith('image/')

      if (!isPdf && !isImage) {
        toast.error('Поддерживаются только PDF и изображения (JPG, PNG)')
        return
      }

      if (file.size > MAX_CHAT_FILE_SIZE) {
        toast.error('Файл слишком большой. Максимальный размер: 20 МБ')
        return
      }

      addAttachedDocument({
        id: `temp-${Date.now()}`,
        name: file.name,
        isUploadedFile: true,
        file,
      })
    },
    [addAttachedDocument],
  )

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
        onAfterDrop?.()
        return
      }
      if (e.dataTransfer.files.length > 0) {
        handleFilesSelected(e.dataTransfer.files)
        onAfterDrop?.()
      }
    },
    [onDocumentDrop, handleFilesSelected, onAfterDrop],
  )

  return { isDragging, handleFilesSelected, handleDragOver, handleDragLeave, handleDrop }
}
