import { useState, useCallback, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import { useSidePanelStore } from '@/store/sidePanelStore'

interface AttachedDocument {
  id: string
  name: string
  textContent?: string | null
  isUploadedFile?: boolean
}

interface ProjectDocument {
  id: string
  name: string
  textContent?: string | null
}

interface UseProjectAiDocumentsParams {
  attachedDocuments: AttachedDocument[]
  projectDocuments: ProjectDocument[]
  addAttachedDocument: (doc: { id: string; name: string; textContent?: string | null }) => void
  removeAttachedDocument: (id: string) => void
  disableAllSources: () => void
}

export function useProjectAiDocuments({
  attachedDocuments,
  projectDocuments,
  addAttachedDocument,
  removeAttachedDocument,
  disableAllSources,
}: UseProjectAiDocumentsParams) {
  const [docPickerOpen, setDocPickerOpen] = useState(false)

  const handleOpenDocPicker = useCallback(() => {
    setDocPickerOpen(true)
  }, [])

  const handleDocumentDrop = useCallback(
    (documentId: string) => {
      if (attachedDocuments.some((d) => d.id === documentId)) return

      const doc = projectDocuments.find((d) => d.id === documentId)
      if (doc) {
        addAttachedDocument({ id: doc.id, name: doc.name, textContent: doc.textContent })
      } else {
        toast.error('Документ не найден в проекте')
      }
    },
    [attachedDocuments, projectDocuments, addAttachedDocument],
  )

  const handleConfirmDocPicker = useCallback(
    (selectedIds: Set<string>) => {
      for (const doc of attachedDocuments) {
        if (!doc.isUploadedFile && !selectedIds.has(doc.id)) {
          removeAttachedDocument(doc.id)
        }
      }
      for (const id of selectedIds) {
        if (!attachedDocuments.some((d) => d.id === id)) {
          const doc = projectDocuments.find((d) => d.id === id)
          if (doc) {
            addAttachedDocument({ id: doc.id, name: doc.name, textContent: doc.textContent })
          }
        }
      }
      setDocPickerOpen(false)
    },
    [attachedDocuments, projectDocuments, addAttachedDocument, removeAttachedDocument],
  )

  const initialPickerSelected = useMemo(
    () => new Set(attachedDocuments.filter((d) => !d.isUploadedFile).map((d) => d.id)),
    [attachedDocuments],
  )

  // Подхватываем документы, проброшенные из FloatingBatchActions
  const pendingAiDocuments = useSidePanelStore((s) => s.pendingAiDocuments)
  const clearPendingAiDocuments = useSidePanelStore((s) => s.clearPendingAiDocuments)

  useEffect(() => {
    if (pendingAiDocuments.length === 0) return
    for (const doc of pendingAiDocuments) {
      if (!attachedDocuments.some((d) => d.id === doc.id)) {
        addAttachedDocument({ id: doc.id, name: doc.name, textContent: doc.textContent })
      }
    }
    disableAllSources()
    clearPendingAiDocuments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAiDocuments, clearPendingAiDocuments])

  return {
    docPickerOpen,
    setDocPickerOpen,
    handleOpenDocPicker,
    handleDocumentDrop,
    handleConfirmDocPicker,
    initialPickerSelected,
  }
}
