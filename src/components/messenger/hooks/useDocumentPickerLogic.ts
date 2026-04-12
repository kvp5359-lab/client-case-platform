import { useState, useCallback, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { fetchDocumentsForAi } from '@/hooks/messenger/useDocumentsForAi'
import { useDocumentStatuses } from '@/hooks/useStatuses'
import { downloadDocumentBlob } from '@/services/documents/documentService'
import { messengerAiKeys, STALE_TIME } from '@/hooks/queryKeys'

export function useDocumentPickerLogic(projectId: string, workspaceId: string) {
  const { data: projectDocuments = [] } = useQuery({
    queryKey: messengerAiKeys.documents(projectId),
    queryFn: () => fetchDocumentsForAi(projectId),
    enabled: !!projectId,
    staleTime: STALE_TIME.LONG,
  })

  const { data: docStatuses = [] } = useDocumentStatuses(workspaceId)
  const statusMap = useMemo(() => new Map(docStatuses.map((s) => [s.id, s])), [docStatuses])

  const [docPickerOpen, setDocPickerOpen] = useState(false)
  const [docPickerKey, setDocPickerKey] = useState(0)
  const [isDownloading, setIsDownloading] = useState(false)
  const addFilesRef = useRef<((files: File[]) => void) | null>(null)

  const handleOpenDocPicker = useCallback(() => {
    setDocPickerKey((k) => k + 1)
    setDocPickerOpen(true)
  }, [])

  const handleConfirmDocPicker = useCallback(async (selected: Set<string>) => {
    if (selected.size === 0) {
      setDocPickerOpen(false)
      return
    }

    const selectedIds = [...selected]
    setIsDownloading(true)

    try {
      const { data: docFiles } = await supabase
        .from('document_files')
        .select('document_id, file_path, file_name, mime_type, file_id')
        .in('document_id', selectedIds)
        .eq('is_current', true)

      if (!docFiles || docFiles.length === 0) {
        toast.error('Не удалось найти файлы документов')
        setDocPickerOpen(false)
        setIsDownloading(false)
        return
      }

      // Параллельное скачивание: вместо последовательного цикла ждём все загрузки разом.
      // Для 10 файлов — ускорение с суммы на максимум длительности.
      const results = await Promise.all(
        docFiles.map(async (df) => {
          try {
            const blob = await downloadDocumentBlob(df.file_path, df.file_id)
            return new File([blob], df.file_name, {
              type: df.mime_type || 'application/octet-stream',
            })
          } catch {
            toast.warning(`Не удалось скачать: ${df.file_name}`)
            return null
          }
        }),
      )
      const downloadedFiles: File[] = results.filter((f): f is File => f !== null)

      if (downloadedFiles.length > 0) {
        addFilesRef.current?.(downloadedFiles)
      } else {
        toast.error('Не удалось скачать файлы')
      }
    } catch {
      toast.error('Ошибка при загрузке документов')
    } finally {
      setIsDownloading(false)
      setDocPickerOpen(false)
    }
  }, [])

  const handleDocumentDrop = useCallback(async (documentId: string) => {
    try {
      const { data: docFile } = await supabase
        .from('document_files')
        .select('file_path, file_name, mime_type, file_id')
        .eq('document_id', documentId)
        .eq('is_current', true)
        .maybeSingle()

      if (!docFile) {
        toast.error('Не удалось найти файл документа')
        return
      }

      const blob = await downloadDocumentBlob(docFile.file_path, docFile.file_id)
      const file = new File([blob], docFile.file_name, {
        type: docFile.mime_type || 'application/octet-stream',
      })
      addFilesRef.current?.([file])
    } catch {
      toast.error('Не удалось прикрепить документ')
    }
  }, [])

  return {
    projectDocuments,
    statusMap,
    docPickerOpen,
    setDocPickerOpen,
    docPickerKey,
    isDownloading,
    addFilesRef,
    handleOpenDocPicker,
    handleConfirmDocPicker,
    handleDocumentDrop,
  }
}
