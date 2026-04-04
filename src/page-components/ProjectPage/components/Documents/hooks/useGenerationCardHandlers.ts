"use client"

/**
 * Хук логики GenerationCard — состояние, мутации, хендлеры
 */

import { useState, useCallback } from 'react'
import {
  useUpdateDocumentGeneration,
  useDeleteDocumentGeneration,
  useFillFromFormKit,
  useGenerateFromGeneration,
  downloadGeneratedFile,
  base64ToFile,
} from '@/hooks/documents/useDocumentGenerations'
import { useDocumentTemplates } from '@/hooks/documents/useDocumentTemplates'
import { useDocuments } from '@/hooks/useDocuments'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { toast } from 'sonner'
import type { DocumentGeneration } from '@/services/api/documentGenerationService'
import type { DocumentTemplatePlaceholder } from '@/services/api/documentTemplateService'

interface FolderInfo {
  id: string
  name: string
  document_kit_id: string
}

interface GeneratedResult {
  fileBase64: string
  fileName: string
  mimeType: string
}

export function useGenerationCardHandlers(
  generation: DocumentGeneration,
  workspaceId: string,
  projectId: string,
) {
  const { data: templates = [] } = useDocumentTemplates(workspaceId)
  const template = templates.find((t) => t.id === generation.document_template_id)
  const placeholders = (template?.placeholders || []) as DocumentTemplatePlaceholder[]

  const updateMutation = useUpdateDocumentGeneration()
  const deleteMutation = useDeleteDocumentGeneration()
  const fillMutation = useFillFromFormKit()
  const generateMutation = useGenerateFromGeneration()
  const { uploadDocument } = useDocuments(projectId)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [localValues, setLocalValues] = useState<Record<string, string>>(
    generation.placeholder_values || {},
  )
  const [nameValue, setNameValue] = useState(generation.name)

  // Результат генерации — сохраняется для выбора папки
  const [generatedResult, setGeneratedResult] = useState<GeneratedResult | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savingFolderId, setSavingFolderId] = useState<string | null | undefined>(undefined)

  const handleDialogOpen = useCallback(() => {
    setLocalValues(generation.placeholder_values || {})
    setNameValue(generation.name)
    setDialogOpen(true)
  }, [generation.placeholder_values, generation.name])

  const handleFieldChange = useCallback((placeholderName: string, value: string) => {
    setLocalValues((prev) => ({ ...prev, [placeholderName]: value }))
  }, [])

  const handleSave = useCallback(() => {
    const updates: { name?: string; placeholder_values?: Record<string, string> } = {}
    if (nameValue.trim() && nameValue.trim() !== generation.name) {
      updates.name = nameValue.trim()
    }
    updates.placeholder_values = localValues
    updateMutation.mutate({ id: generation.id, updates })
  }, [generation.id, generation.name, nameValue, localValues, updateMutation])

  const handleClose = useCallback(
    (open: boolean) => {
      if (!open) {
        handleSave()
      }
      setDialogOpen(open)
    },
    [handleSave],
  )

  const handleFillFromFormKit = useCallback(async () => {
    const values = await fillMutation.mutateAsync({
      projectId,
      placeholders,
    })

    const merged = { ...localValues }
    let filledCount = 0
    for (const [key, value] of Object.entries(values)) {
      if (value) {
        merged[key] = value
        filledCount++
      }
    }

    setLocalValues(merged)
    updateMutation.mutate({
      id: generation.id,
      updates: { placeholder_values: merged },
    })

    if (filledCount > 0) {
      toast.success(`Заполнено ${filledCount} полей из анкеты`)
    } else {
      toast.info('Нет данных для заполнения в анкетах проекта')
    }
  }, [projectId, placeholders, localValues, generation.id, fillMutation, updateMutation])

  const handleGenerate = useCallback(async () => {
    handleSave()

    const result = await generateMutation.mutateAsync({
      documentTemplateId: generation.document_template_id,
      projectId,
      workspaceId,
      customValues: localValues,
      convertToPdf: true,
    })

    setGeneratedResult(result)
    setDialogOpen(false)
    setSaveDialogOpen(true)
  }, [generation, projectId, workspaceId, localValues, generateMutation, handleSave])

  const handleSaveToFolder = useCallback(
    async (folder: FolderInfo | null) => {
      if (!generatedResult) return

      setIsSaving(true)
      setSavingFolderId(folder?.id ?? null)
      try {
        const file = base64ToFile(
          generatedResult.fileBase64,
          generatedResult.fileName,
          generatedResult.mimeType,
        )

        await uploadDocument({
          file,
          documentKitId: folder?.document_kit_id ?? null,
          projectId,
          workspaceId,
          folderId: folder?.id ?? null,
        })

        toast.success('PDF сохранён в папку проекта')
        setSaveDialogOpen(false)
        setGeneratedResult(null)
      } catch {
        toast.error('Ошибка сохранения PDF в проект')
      } finally {
        setIsSaving(false)
        setSavingFolderId(undefined)
      }
    },
    [generatedResult, uploadDocument, projectId, workspaceId],
  )

  const handleDownload = useCallback(() => {
    if (!generatedResult) return
    downloadGeneratedFile(
      generatedResult.fileBase64,
      generatedResult.fileName,
      generatedResult.mimeType,
    )
    toast.success('PDF скачан')
    setSaveDialogOpen(false)
    setGeneratedResult(null)
  }, [generatedResult])

  const handleSaveDialogClose = useCallback((open: boolean) => {
    if (!open) {
      setSaveDialogOpen(false)
      setGeneratedResult(null)
      setSavingFolderId(undefined)
    }
  }, [])

  // Подтверждение удаления
  const {
    state: deleteConfirmState,
    confirm: confirmDelete,
    handleConfirm: handleDeleteConfirm,
    handleCancel: handleDeleteCancel,
  } = useConfirmDialog()

  const handleDelete = useCallback(async () => {
    const ok = await confirmDelete({
      title: 'Удалить блок генерации?',
      description: `Блок «${generation.name}» и все введённые значения будут удалены.`,
      confirmText: 'Удалить',
      variant: 'destructive',
    })
    if (!ok) return
    deleteMutation.mutate(generation.id)
    setDialogOpen(false)
  }, [generation.id, generation.name, confirmDelete, deleteMutation])

  const filledCount = placeholders.filter((ph) => localValues[ph.name]?.trim()).length

  return {
    template,
    placeholders,
    fillMutation,
    generateMutation,
    dialogOpen,
    localValues,
    nameValue,
    setNameValue,
    generatedResult,
    saveDialogOpen,
    isSaving,
    savingFolderId,
    filledCount,
    deleteConfirmState,
    handleDialogOpen,
    handleFieldChange,
    handleClose,
    handleFillFromFormKit,
    handleGenerate,
    handleSaveToFolder,
    handleDownload,
    handleSaveDialogClose,
    handleDelete,
    handleDeleteConfirm,
    handleDeleteCancel,
  }
}
