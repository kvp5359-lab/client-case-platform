"use client"

import { useRef } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { Tables } from '@/types/database'
import { useErrorHandler } from '@/hooks/shared/useErrorHandler'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { useDocumentKitUIStore } from '@/store/documentKitUI'
import type { DocumentKit } from '@/services/api/documents/documentKitService'
import { deleteFolder } from '@/services/documents/folderService'
import { getTemplateFolders } from '@/services/api/documents/documentKitService'
import {
  MAX_UPLOAD_SIZE,
  ALLOWED_UPLOAD_MIME_TYPES,
  ALLOWED_UPLOAD_EXTENSIONS,
} from '@/utils/files/fileValidation'

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

export function useFolderOperations(
  projectId: string,
  workspaceId: string,
  fetchDocumentKits: (id: string) => Promise<void>,
) {
  const { handleError } = useErrorHandler()
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  // State
  const selectedTemplateIds = useDocumentKitUIStore((state) => state.selectedTemplateIds)
  const folderTemplates = useDocumentKitUIStore((state) => state.folderTemplates)
  const folderFormData = useDocumentKitUIStore((state) => state.folderFormData)
  const editingFolder = useDocumentKitUIStore((state) => state.editingFolder)
  const targetFolderId = useDocumentKitUIStore((state) => state.targetFolderId)

  // Actions
  const {
    toggleFolderCollapse,
    setLoadingTemplates,
    setFolderTemplates,
    toggleTemplateSelection,
    clearTemplateSelection,
    closeTemplateSelectDialog,
    closeAddFolderDialog,
    openEditFolderDialog,
    closeEditFolderDialog,
    resetFolderForm,
    setTargetFolder,
    setUploadingFiles,
  } = useDocumentKitUIStore()

  const fileInputRef = useRef<HTMLInputElement>(null)
  // Z3-55, Z3-56: guards against double invocation
  const isCreatingFoldersRef = useRef(false)
  const isSavingFolderRef = useRef(false)

  const toggleFolder = (folderId: string) => {
    toggleFolderCollapse(folderId)
  }

  const loadFolderTemplates = async (kit: DocumentKit | undefined) => {
    if (!kit?.template_id) return

    try {
      setLoadingTemplates(true)

      const data = await getTemplateFolders(kit.template_id)

      // После миграции KitTemplateFolder хранит данные inline, а не через JOIN folder_templates.
      // Маппим inline-поля в форму Tables<'folder_templates'>, чтобы UI (отображение имени/описания)
      // продолжал работать без переделки консюмеров.
      const templates: Tables<'folder_templates'>[] = []
      if (data) {
        for (const item of data) {
          // Собираем минимальный folder_templates-подобный объект из inline-полей
          templates.push({
            id: item.folder_template_id ?? item.id,
            name: item.name,
            description: item.description,
            ai_naming_prompt: item.ai_naming_prompt,
            ai_check_prompt: item.ai_check_prompt,
            knowledge_article_id: item.knowledge_article_id,
            // Остальные поля folder_templates не используются в UI — проставляем безопасные значения
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any)
        }
      }

      setFolderTemplates(templates)
    } catch (error) {
      handleError(error, { userMessage: 'Ошибка при загрузке шаблонов папок', showToast: false })
    } finally {
      setLoadingTemplates(false)
    }
  }

  const handleToggleTemplateSelection = (templateId: string) => {
    toggleTemplateSelection(templateId)
  }

  const handleCreateFoldersFromTemplates = async (kit: DocumentKit | undefined) => {
    if (!kit || selectedTemplateIds.length === 0) return
    if (isCreatingFoldersRef.current) return
    isCreatingFoldersRef.current = true

    try {
      // Получаем максимальный sort_order для этого набора
      const { data: existingFolders, error: fetchError } = await supabase
        .from('folders')
        .select('sort_order')
        .eq('document_kit_id', kit.id)
        .order('sort_order', { ascending: false })

      if (fetchError) throw fetchError

      let maxSortOrder =
        existingFolders && existingFolders.length > 0
          ? Math.max(...existingFolders.map((f) => f.sort_order || 0))
          : -1

      const foldersToCreate = selectedTemplateIds
        .map((templateId) => {
          const template = folderTemplates.find((t) => t.id === templateId)
          if (!template) return null

          maxSortOrder += 1
          return {
            document_kit_id: kit.id,
            project_id: projectId,
            workspace_id: workspaceId,
            name: template.name,
            description: template.description || null,
            folder_template_id: templateId,
            sort_order: maxSortOrder,
            ai_naming_prompt: template.ai_naming_prompt || null,
            ai_check_prompt: template.ai_check_prompt || null,
            knowledge_article_id: template.knowledge_article_id || null,
          }
        })
        .filter((f): f is NonNullable<typeof f> => f !== null)

      if (foldersToCreate.length === 0) return

      const { data: createdFolders, error } = await supabase
        .from('folders')
        .insert(foldersToCreate)
        .select('id, folder_template_id')

      if (error) throw error

      // Копируем слоты из шаблонов в созданные папки
      if (createdFolders && createdFolders.length > 0) {
        const templateIds = createdFolders
          .map((f) => f.folder_template_id)
          .filter((id): id is string => id !== null)

        if (templateIds.length > 0) {
          const { data: templateSlots } = await supabase
            .from('folder_template_slots')
            .select('*')
            .in('folder_template_id', templateIds)
            .order('sort_order')

          if (templateSlots && templateSlots.length > 0) {
            const slotsToCreate = []
            for (const folder of createdFolders) {
              if (!folder.folder_template_id) continue
              const slots = templateSlots.filter(
                (s) => s.folder_template_id === folder.folder_template_id,
              )
              for (const slot of slots) {
                slotsToCreate.push({
                  folder_id: folder.id,
                  project_id: projectId,
                  workspace_id: workspaceId,
                  folder_template_slot_id: slot.id,
                  name: slot.name,
                  sort_order: slot.sort_order,
                })
              }
            }

            if (slotsToCreate.length > 0) {
              await supabase.from('folder_slots').insert(slotsToCreate)
            }
          }
        }
      }

      await fetchDocumentKits(projectId)
      closeTemplateSelectDialog()
      clearTemplateSelection()
    } catch (error) {
      handleError(error, 'Ошибка при создании папок')
    } finally {
      isCreatingFoldersRef.current = false
    }
  }

  const handleSaveFolder = async (kit: DocumentKit | undefined) => {
    if (!kit || !folderFormData.name.trim()) return
    if (isSavingFolderRef.current) return
    isSavingFolderRef.current = true

    try {
      if (editingFolder) {
        // Обновление существующей папки (не меняем sort_order)
        const { error } = await supabase
          .from('folders')
          .update({
            name: folderFormData.name.trim(),
            description: folderFormData.description.trim() || null,
            ai_naming_prompt: folderFormData.aiNamingPrompt?.trim() || null,
            ai_check_prompt: folderFormData.aiCheckPrompt?.trim() || null,
            knowledge_article_id: folderFormData.knowledgeArticleId || null,
          })
          .eq('id', editingFolder.id)

        if (error) throw error
      } else {
        // Создание новой папки - получаем максимальный sort_order
        const { data: existingFolders, error: fetchError } = await supabase
          .from('folders')
          .select('sort_order')
          .eq('document_kit_id', kit.id)
          .order('sort_order', { ascending: false })
          .limit(1)

        if (fetchError) throw fetchError

        const maxSortOrder =
          existingFolders && existingFolders.length > 0 ? existingFolders[0].sort_order || 0 : -1

        const { error } = await supabase.from('folders').insert({
          document_kit_id: kit.id,
          project_id: projectId,
          workspace_id: workspaceId,
          name: folderFormData.name.trim(),
          description: folderFormData.description.trim() || null,
          folder_template_id: null,
          sort_order: maxSortOrder + 1,
          ai_naming_prompt: folderFormData.aiNamingPrompt?.trim() || null,
          ai_check_prompt: folderFormData.aiCheckPrompt?.trim() || null,
          knowledge_article_id: folderFormData.knowledgeArticleId || null,
        })

        if (error) throw error
      }

      await fetchDocumentKits(projectId)
      closeAddFolderDialog()
      closeEditFolderDialog()
      resetFolderForm()
    } catch (error) {
      handleError(error, 'Ошибка при сохранении папки')
    } finally {
      isSavingFolderRef.current = false
    }
  }

  const handleEditFolder = (folder: Tables<'folders'>) => {
    openEditFolderDialog(folder)
  }

  const handleAddDocumentClick = () => {
    setTargetFolder(null)
    fileInputRef.current?.click()
  }

  const handleFolderDocumentsClick = (folderId: string) => {
    setTargetFolder(folderId)
    fileInputRef.current?.click()
  }

  const handleDeleteFolder = async (folderId: string) => {
    const ok = await confirm({
      title: 'Удалить папку?',
      description: 'Документы из папки будут перемещены в нераспределённые.',
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return

    try {
      await deleteFolder(folderId)
      await fetchDocumentKits(projectId)
    } catch (error) {
      logger.error('Ошибка удаления папки:', error)
      toast.error('Не удалось удалить папку')
    }
  }

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
    kit: DocumentKit | undefined,
    uploadDocument: UploadDocumentFn,
  ) => {
    const files = event.target.files
    if (!files || files.length === 0 || !kit) return

    const invalidFiles = Array.from(files).filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase() || ''
      return !ALLOWED_UPLOAD_MIME_TYPES.has(f.type) && !ALLOWED_UPLOAD_EXTENSIONS.has(ext)
    })
    if (invalidFiles.length > 0) {
      const names = invalidFiles.map((f) => f.name).join(', ')
      toast.error(`Недопустимый формат файла: ${names}. Разрешены: PDF, DOC, DOCX, JPG, PNG`)
      event.target.value = ''
      return
    }

    const oversizedFiles = Array.from(files).filter((f) => f.size > MAX_UPLOAD_SIZE)
    if (oversizedFiles.length > 0) {
      toast.error(
        `${oversizedFiles.length > 1 ? 'Файлы слишком большие' : 'Файл слишком большой'}. Максимальный размер: 50 МБ`,
      )
      event.target.value = ''
      return
    }

    const fileNames = Array.from(files).map((f) => f.name)
    setUploadingFiles(fileNames)

    try {
      for (const file of Array.from(files)) {
        await uploadDocument({
          file,
          documentKitId: kit.id,
          projectId,
          workspaceId,
          folderId: targetFolderId || null,
        })
      }

      await fetchDocumentKits(projectId)
      event.target.value = ''
    } catch (error) {
      handleError(error, 'Ошибка при загрузке файлов')
    } finally {
      setUploadingFiles([])
      setTargetFolder(null)
    }
  }

  const confirmDialogProps = {
    state: confirmState,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  }

  return {
    fileInputRef,
    toggleFolder,
    loadFolderTemplates,
    handleToggleTemplateSelection,
    handleCreateFoldersFromTemplates,
    handleSaveFolder,
    handleEditFolder,
    handleDeleteFolder,
    handleAddDocumentClick,
    handleFolderDocumentsClick,
    handleFileChange,
    confirmDialogProps,
  }
}
