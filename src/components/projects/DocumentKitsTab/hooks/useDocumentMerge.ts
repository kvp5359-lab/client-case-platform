"use client"

import { useRef } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useErrorHandler } from '@/hooks/shared/useErrorHandler'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { Tables } from '@/types/database'
import { mergeFilesToPDF } from '@/utils/mergePDF'
import { downloadDocumentBlob } from '@/services/documents/documentService'
import { useDocumentKitUIStore } from '@/store/documentKitUI'
import type { DocumentWithFiles } from '@/components/documents/types'
import type { DocumentKitWithDocuments } from '@/services/api/documentKitService'

// Тип для upload функции
interface UploadDocumentParams {
  file: File
  documentKitId: string
  projectId: string
  workspaceId: string
  documentName?: string
  documentDescription?: string
  folderId?: string | null
  sourceDocumentId?: string | null
}

type UploadDocumentFn = (
  params: UploadDocumentParams,
) => Promise<{ document: Tables<'documents'>; fileId: string }>
type SoftDeleteDocumentFn = (documentId: string) => Promise<void>

interface MergeDocumentsParams {
  documentKitId: string
  allDocuments: DocumentWithFiles[]
}

export function useDocumentMerge(
  projectId: string,
  workspaceId: string,
  fetchDocumentKits: () => Promise<void>,
  uploadDocument: UploadDocumentFn,
  softDeleteDocument: SoftDeleteDocumentFn,
  clearSelection: () => void,
) {
  const { handleError } = useErrorHandler()
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()
  // Z3-05: защита от race condition при быстром переоткрытии диалога merge
  const mergeNameRequestIdRef = useRef(0)

  // State
  const mergeDocsList = useDocumentKitUIStore((state) => state.mergeDocsList)
  const mergeName = useDocumentKitUIStore((state) => state.mergeName)
  const mergeFolderId = useDocumentKitUIStore((state) => state.mergeFolderId)
  const draggedIndex = useDocumentKitUIStore((state) => state.draggedIndex)

  // Actions
  const {
    openMergeDialog,
    closeMergeDialog,
    updateMergeName,
    setMergeFolder,
    setGeneratingMergeName,
    setMerging,
    reorderMergeDocs,
    setDraggedIndex,
  } = useDocumentKitUIStore()

  const handleOpenMergeDialog = (
    kit: DocumentKitWithDocuments | undefined,
    selectedDocuments: Set<string>,
  ) => {
    if (selectedDocuments.size < 2) {
      toast.warning('Выберите хотя бы 2 документа для объединения')
      return
    }

    const selectedDocs = (kit?.documents?.filter((d) => selectedDocuments.has(d.id)) || []).sort(
      (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime(),
    )

    const docsList = selectedDocs.map((doc, index) => {
      const currentFile = doc.document_files?.find((f) => f.is_current) || doc.document_files?.[0]
      return {
        id: doc.id,
        name: doc.name,
        size: currentFile?.file_size || 0,
        order: index + 1,
      }
    })

    const firstDoc = selectedDocs[0]
    const firstDocFolderId = firstDoc?.folder_id || null
    updateMergeName('')
    openMergeDialog(docsList, firstDocFolderId)
    generateMergeNameWithAI(selectedDocs)
  }

  const getDefaultMergeName = (docs: { name: string }[]) =>
    docs.length === 2
      ? `${docs[0].name.replace(/\.[^/.]+$/, '')} и ${docs[1].name.replace(/\.[^/.]+$/, '')}.pdf`
      : `Объединённый документ (${docs.length} файлов).pdf`

  const generateMergeNameWithAI = async (docs: { name: string }[] | undefined) => {
    if (!docs || docs.length === 0) return

    const requestId = ++mergeNameRequestIdRef.current
    setGeneratingMergeName(true)

    try {
      const documentNames = docs.map((d) => d.name).join(', ')

      const { data, error } = await supabase.functions.invoke('generate-merge-name', {
        body: {
          workspace_id: workspaceId,
          document_names: documentNames,
          count: docs.length,
        },
      })

      // Z3-05: игнорируем ответ, если уже был новый запрос
      if (requestId !== mergeNameRequestIdRef.current) return

      if (error) {
        handleError(error, { userMessage: 'Ошибка генерации имени', showToast: false })
        updateMergeName(getDefaultMergeName(docs))
        return
      }

      if (data?.name) {
        updateMergeName(data.name.endsWith('.pdf') ? data.name : `${data.name}.pdf`)
      } else {
        updateMergeName(getDefaultMergeName(docs))
      }
    } catch (error) {
      if (requestId !== mergeNameRequestIdRef.current) return
      handleError(error, { userMessage: 'Ошибка генерации имени', showToast: false })
      updateMergeName(getDefaultMergeName(docs))
    } finally {
      if (requestId === mergeNameRequestIdRef.current) {
        setGeneratingMergeName(false)
      }
    }
  }

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    if (draggedIndex !== null) {
      reorderMergeDocs(draggedIndex, index)
    }
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const handleRemoveFromMerge = (id: string) => {
    const newList = mergeDocsList.filter((doc) => doc.id !== id)

    if (newList.length < 2) {
      closeMergeDialog()
    } else {
      const docsWithoutOrder = newList.map(({ id, name, size }) => ({ id, name, size }))
      // Сохраняем текущую папку при удалении документа
      openMergeDialog(docsWithoutOrder, mergeFolderId)
    }
  }

  const handleMergeDocuments = async ({ documentKitId, allDocuments }: MergeDocumentsParams) => {
    const docsToMerge = mergeDocsList

    if (docsToMerge.length < 2) {
      toast.warning('Выберите хотя бы 2 документа для объединения')
      return
    }

    try {
      setMerging(true, { current: 0, total: docsToMerge.length })

      const selectedDocs = docsToMerge
        .map((item) => allDocuments.find((d) => d.id === item.id))
        .filter((d): d is DocumentWithFiles => d !== undefined)

      const docsWithoutFiles = selectedDocs.filter(
        (d) => !d.document_files || d.document_files.length === 0,
      )
      if (docsWithoutFiles.length > 0) {
        toast.error(
          `У ${docsWithoutFiles.length} документов отсутствуют файлы: ${docsWithoutFiles.map((d) => d.name).join(', ')}`,
        )
        setMerging(false)
        return
      }

      const filesToMerge: File[] = []
      const failedDownloads: string[] = []

      for (const doc of selectedDocs) {
        const currentFile = doc.document_files?.find((f) => f.is_current) || doc.document_files?.[0]
        if (!currentFile) {
          failedDownloads.push(doc.name)
          continue
        }

        try {
          const data = await downloadDocumentBlob(currentFile.file_path, currentFile.file_id)

          const file = new File([data], currentFile.file_name, { type: currentFile.mime_type })
          filesToMerge.push(file)

          setMerging(true, { current: filesToMerge.length, total: selectedDocs.length })
        } catch (error) {
          handleError(error, {
            userMessage: 'Ошибка скачивания файла для объединения',
            showToast: false,
          })
          failedDownloads.push(doc.name)
        }
      }

      if (failedDownloads.length > 0) {
        const proceed = await confirm({
          title: 'Не все файлы загружены',
          description: `Не удалось загрузить ${failedDownloads.length} файлов: ${failedDownloads.join(', ')}. Продолжить объединение оставшихся ${filesToMerge.length} файлов?`,
          confirmText: 'Продолжить',
          cancelText: 'Отмена',
        })
        if (!proceed) {
          setMerging(false)
          return
        }
      }

      if (filesToMerge.length < 2) {
        toast.error('Не удалось загрузить достаточно файлов для объединения (минимум 2)')
        setMerging(false)
        return
      }

      const result = await mergeFilesToPDF(filesToMerge, {
        onProgress: (current, total) => {
          setMerging(true, { current, total })
        },
      })

      const finalName =
        mergeName.trim() || `Объединённый документ ${new Date().toLocaleDateString('ru-RU')}.pdf`
      const fileName = finalName.endsWith('.pdf') ? finalName : `${finalName}.pdf`

      const mergedFile = new File([result.blob], fileName, { type: 'application/pdf' })

      await uploadDocument({
        file: mergedFile,
        documentKitId,
        projectId,
        workspaceId,
        documentName: fileName.replace('.pdf', ''),
        documentDescription: `Объединение ${selectedDocs.length} документов: ${selectedDocs.map((d) => d.name).join(', ')}`,
        folderId: mergeFolderId || undefined,
      })

      for (const doc of selectedDocs) {
        try {
          await softDeleteDocument(doc.id)
        } catch (error) {
          handleError(error, {
            userMessage: 'Ошибка удаления исходного документа после объединения',
            showToast: false,
          })
        }
      }

      await fetchDocumentKits()
      clearSelection()
      closeMergeDialog()
      updateMergeName('')
      setMergeFolder(null)

      if (result.failedFiles.length > 0) {
        const failedList = result.failedFiles.map((f) => `${f.name}: ${f.error}`).join(', ')
        toast.warning('Документы объединены с предупреждениями', {
          description: `Не удалось обработать ${result.failedFiles.length} файл(ов): ${failedList}. Остальные файлы успешно объединены.`,
          duration: 10000,
          closeButton: true,
        })
      } else {
        toast.success('Документы успешно объединены!')
      }
    } catch (error) {
      handleError(error, 'Ошибка при объединении документов')
    } finally {
      setMerging(false)
    }
  }

  const confirmDialogProps = {
    state: confirmState,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  }

  return {
    handleOpenMergeDialog,
    handleMergeDocuments,
    generateMergeNameWithAI,
    handleRemoveFromMerge,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    confirmDialogProps,
  }
}
