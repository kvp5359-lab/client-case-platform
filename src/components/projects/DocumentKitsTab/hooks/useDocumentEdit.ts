import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Tables } from '@/types/database'
import { logger } from '@/utils/logger'
import { updateDocument } from '@/services/documents'
import { useDocumentKitUIStore } from '@/store/documentKitUI'
import type { DocumentKitWithDocuments } from '@/services/api/documentKitService'

export function useDocumentEdit(
  projectId: string,
  fetchDocumentKits: (id: string) => Promise<void>,
) {
  // State
  const documentToEdit = useDocumentKitUIStore((state) => state.documentToEdit)
  const editName = useDocumentKitUIStore((state) => state.editName)
  const editDescription = useDocumentKitUIStore((state) => state.editDescription)
  const editStatus = useDocumentKitUIStore((state) => state.editStatus)

  // Actions
  const {
    openEditDialog,
    closeEditDialog,
    updateEditForm,
    setSuggestedNames,
    openContentViewDialog,
    setLoadingContent,
    updateDocumentTextContent,
  } = useDocumentKitUIStore()

  const handleOpenEditDialog = (documentId: string, kit: DocumentKitWithDocuments | undefined) => {
    const doc = kit?.documents?.find((d) => d.id === documentId)
    if (doc) {
      openEditDialog(doc as Tables<'documents'> & { document_files?: Tables<'document_files'>[] })
      updateEditForm('name', doc.name)
      updateEditForm('description', doc.description || '')
      updateEditForm('status', doc.status || '')
      setSuggestedNames([])

      // Если text_content нет в кэше — подгрузить из БД (мог появиться после фонового извлечения)
      if (!doc.text_content) {
        supabase
          .from('documents')
          .select('text_content')
          .eq('id', documentId)
          .single()
          .then(({ data }) => {
            if (data?.text_content) {
              updateDocumentTextContent(data.text_content)
            }
          })
      }
    }
  }

  const handleViewContent = async () => {
    if (!documentToEdit) return

    try {
      setLoadingContent(true)
      openContentViewDialog('')

      // Если содержимое уже есть в документе, используем его
      if (documentToEdit.text_content) {
        openContentViewDialog(documentToEdit.text_content)
        setLoadingContent(false)
        return
      }

      // Иначе загружаем из БД (на случай, если данные устарели)
      const { data, error } = await supabase
        .from('documents')
        .select('text_content')
        .eq('id', documentToEdit.id)
        .single()

      if (error) throw error

      if (data?.text_content) {
        openContentViewDialog(data.text_content)
      } else {
        openContentViewDialog(
          'Содержимое документа еще не извлечено. Выполните проверку документа, чтобы извлечь текст.',
        )
      }
    } catch (error) {
      logger.error('Ошибка при загрузке содержимого документа:', error)
      openContentViewDialog('Ошибка при загрузке содержимого документа')
    } finally {
      setLoadingContent(false)
    }
  }

  const handleClearContent = async () => {
    if (!documentToEdit) return

    try {
      const { error } = await supabase
        .from('documents')
        .update({ text_content: null })
        .eq('id', documentToEdit.id)

      if (error) throw error

      // Обновляем локальное состояние documentToEdit
      updateDocumentTextContent(null)

      // Обновляем содержимое в диалоге просмотра
      openContentViewDialog('')

      // Обновляем список документов
      await fetchDocumentKits(projectId)
    } catch (error) {
      logger.error('Ошибка при очистке содержимого документа:', error)
      toast.error('Ошибка при очистке содержимого')
    }
  }

  const handleSaveDocument = async () => {
    if (!documentToEdit || !editName.trim()) return

    try {
      // 1. Обновляем название документа
      await updateDocument(documentToEdit.id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        status: editStatus || null,
      })

      // 2. Обновляем file_name у текущего файла документа
      const doc = documentToEdit as Tables<'documents'> & {
        document_files?: Tables<'document_files'>[]
      }
      const currentFile =
        doc.document_files?.find((f: Tables<'document_files'>) => f.is_current) ||
        doc.document_files?.[0]

      if (currentFile) {
        // Получаем расширение из старого имени
        const oldFileName = currentFile.file_name
        const extensionMatch = oldFileName.match(/\.[^.]+$/)
        const extension = extensionMatch ? extensionMatch[0] : ''

        // Формируем новое имя файла с расширением
        const newFileName = editName.trim() + extension

        // Обновляем file_name
        const { error: fileError } = await supabase
          .from('document_files')
          .update({ file_name: newFileName })
          .eq('id', currentFile.id)

        if (fileError) {
          logger.error('Ошибка при обновлении имени файла документа:', fileError)
        }
      }

      // 3. Обновляем список документов
      await fetchDocumentKits(projectId)
      toast.success('Документ сохранён')
      closeEditDialog()
    } catch (error) {
      logger.error('Ошибка при сохранении документа:', error)
      toast.error('Ошибка при сохранении документа')
    }
  }

  return {
    handleOpenEditDialog,
    handleViewContent,
    handleSaveDocument,
    handleClearContent,
  }
}
