"use client"

/**
 * useFolderCRUD — CRUD-операции для папок документов
 * Извлечено из DocumentsTabContent для уменьшения размера компонента.
 */

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useDialog } from '@/hooks/shared/useDialog'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import type { DocumentKitWithDocuments } from '@/components/documents/types'

interface UseFolderCRUDParams {
  projectId: string
  workspaceId: string
  documentKits: DocumentKitWithDocuments[]
  invalidateDocumentKits: () => Promise<void>
}

export function useFolderCRUD({
  projectId,
  workspaceId,
  documentKits,
  invalidateDocumentKits,
}: UseFolderCRUDParams) {
  const folderDialog = useDialog()
  const [folderDialogKitId, setFolderDialogKitId] = useState<string | null>(null)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [folderName, setFolderName] = useState('')
  const [folderDescription, setFolderDescription] = useState('')
  const [folderAiNamingPrompt, setFolderAiNamingPrompt] = useState('')
  const [folderAiCheckPrompt, setFolderAiCheckPrompt] = useState('')
  const [folderKnowledgeArticleId, setFolderKnowledgeArticleId] = useState<string | null>(null)
  const [isSavingFolder, setIsSavingFolder] = useState(false)

  const {
    state: deleteFolderConfirmState,
    confirm: confirmDeleteFolder,
    handleConfirm: deleteFolderHandleConfirm,
    handleCancel: deleteFolderHandleCancel,
  } = useConfirmDialog()

  const handleOpenAddFolder = useCallback(
    (kitId: string) => {
      setFolderDialogKitId(kitId)
      setEditingFolderId(null)
      setFolderName('')
      setFolderDescription('')
      setFolderAiNamingPrompt('')
      setFolderAiCheckPrompt('')
      setFolderKnowledgeArticleId(null)
      folderDialog.open()
    },
    [folderDialog],
  )

  const handleOpenEditFolder = useCallback(
    (folderId: string) => {
      for (const kit of documentKits) {
        const folder = kit.folders?.find((f) => f.id === folderId)
        if (folder) {
          setFolderDialogKitId(kit.id)
          setEditingFolderId(folderId)
          setFolderName(folder.name || '')
          setFolderDescription(folder.description || '')
          setFolderAiNamingPrompt(folder.ai_naming_prompt || '')
          setFolderAiCheckPrompt(folder.ai_check_prompt || '')
          setFolderKnowledgeArticleId(folder.knowledge_article_id || null)
          folderDialog.open()
          return
        }
      }
    },
    [documentKits, folderDialog],
  )

  const handleSaveFolder = useCallback(async () => {
    if (!folderDialogKitId || !folderName.trim() || isSavingFolder) return
    setIsSavingFolder(true)
    try {
      if (editingFolderId) {
        const { error } = await supabase
          .from('folders')
          .update({
            name: folderName.trim(),
            description: folderDescription.trim() || null,
            ai_naming_prompt: folderAiNamingPrompt.trim() || null,
            ai_check_prompt: folderAiCheckPrompt.trim() || null,
            knowledge_article_id: folderKnowledgeArticleId || null,
          })
          .eq('id', editingFolderId)
        if (error) throw error
        toast.success('Папка обновлена')
      } else {
        const { data: existingFolders, error: fetchError } = await supabase
          .from('folders')
          .select('sort_order')
          .eq('document_kit_id', folderDialogKitId)
          .order('sort_order', { ascending: false })
          .limit(1)
        if (fetchError) throw fetchError

        const maxSortOrder =
          existingFolders && existingFolders.length > 0 ? existingFolders[0].sort_order || 0 : -1

        const { error } = await supabase.from('folders').insert({
          document_kit_id: folderDialogKitId,
          project_id: projectId,
          workspace_id: workspaceId,
          name: folderName.trim(),
          description: folderDescription.trim() || null,
          ai_naming_prompt: folderAiNamingPrompt.trim() || null,
          ai_check_prompt: folderAiCheckPrompt.trim() || null,
          knowledge_article_id: folderKnowledgeArticleId || null,
          folder_template_id: null,
          sort_order: maxSortOrder + 1,
        })
        if (error) throw error
        toast.success('Папка создана')
      }

      await invalidateDocumentKits()
      folderDialog.close()
    } catch {
      toast.error(editingFolderId ? 'Не удалось обновить папку' : 'Не удалось создать папку')
    } finally {
      setIsSavingFolder(false)
    }
  }, [
    folderDialogKitId,
    editingFolderId,
    folderName,
    folderDescription,
    folderAiNamingPrompt,
    folderAiCheckPrompt,
    folderKnowledgeArticleId,
    isSavingFolder,
    projectId,
    workspaceId,
    invalidateDocumentKits,
    folderDialog,
  ])

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      let folderNameForConfirm = 'папку'
      for (const kit of documentKits) {
        const folder = kit.folders?.find((f) => f.id === folderId)
        if (folder) {
          folderNameForConfirm = folder.name
          break
        }
      }

      const ok = await confirmDeleteFolder({
        title: `Удалить папку «${folderNameForConfirm}»?`,
        description: 'Документы из этой папки переместятся в нераспределённые.',
        variant: 'destructive',
        confirmText: 'Удалить',
      })
      if (!ok) return

      try {
        const { deleteFolder } = await import('@/services/documents/folderService')
        await deleteFolder(folderId)
        await invalidateDocumentKits()
        toast.success('Папка удалена')
      } catch {
        toast.error('Не удалось удалить папку')
      }
    },
    [documentKits, confirmDeleteFolder, invalidateDocumentKits],
  )

  return {
    // Dialog state
    folderDialog,
    editingFolderId,
    folderName,
    folderDescription,
    folderAiNamingPrompt,
    folderAiCheckPrompt,
    folderKnowledgeArticleId,
    isSavingFolder,

    // Setters (for FolderDialog props)
    setFolderName,
    setFolderDescription,
    setFolderAiNamingPrompt,
    setFolderAiCheckPrompt,
    setFolderKnowledgeArticleId,

    // Handlers
    handleOpenAddFolder,
    handleOpenEditFolder,
    handleSaveFolder,
    handleDeleteFolder,

    // Delete confirm dialog props
    deleteFolderConfirmState,
    deleteFolderHandleConfirm,
    deleteFolderHandleCancel,
  }
}
