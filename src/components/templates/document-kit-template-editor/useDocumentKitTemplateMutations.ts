/**
 * Хук для мутаций шаблона набора документов
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { KitFolder } from './types'

interface UseDocumentKitTemplateMutationsProps {
  kitId: string | undefined
  kitFolders: KitFolder[]
  onAddFoldersSuccess?: () => void
}

export function useDocumentKitTemplateMutations({
  kitId,
  kitFolders,
  onAddFoldersSuccess,
}: UseDocumentKitTemplateMutationsProps) {
  const queryClient = useQueryClient()

  // Обновление названия и описания
  const updateKitMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      if (!kitId) return

      const { error } = await supabase
        .from('document_kit_templates')
        .update({
          name: data.name,
          description: data.description || null,
        })
        .eq('id', kitId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-kit-template', kitId] })
    },
    onError: () => {
      toast.error('Не удалось обновить шаблон')
    },
  })

  // Добавление папок из библиотеки шаблонов (атомарная RPC)
  const addFoldersMutation = useMutation({
    mutationFn: async (folderTemplateIds: string[]) => {
      if (!kitId) return

      const maxOrder =
        kitFolders.length > 0 ? Math.max(...kitFolders.map((f) => f.order_index)) : -1

      const { error } = await supabase.rpc('add_folders_to_kit_template', {
        p_kit_template_id: kitId,
        p_folder_template_ids: folderTemplateIds,
        p_start_order_index: maxOrder + 1,
      })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit-folders', kitId] })
      onAddFoldersSuccess?.()
    },
    onError: () => {
      toast.error('Не удалось добавить папки')
    },
  })

  // Создание папки вручную
  const createFolderMutation = useMutation({
    mutationFn: async (data: {
      name: string
      description?: string | null
      ai_naming_prompt?: string | null
      ai_check_prompt?: string | null
      knowledge_article_id?: string | null
    }) => {
      if (!kitId) return

      const maxOrder =
        kitFolders.length > 0 ? Math.max(...kitFolders.map((f) => f.order_index)) : -1

      const { error } = await supabase.from('document_kit_template_folders').insert({
        kit_template_id: kitId,
        name: data.name,
        description: data.description || null,
        ai_naming_prompt: data.ai_naming_prompt || null,
        ai_check_prompt: data.ai_check_prompt || null,
        knowledge_article_id: data.knowledge_article_id || null,
        order_index: maxOrder + 1,
      })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit-folders', kitId] })
      toast.success('Папка создана')
    },
    onError: () => {
      toast.error('Не удалось создать папку')
    },
  })

  // Обновление данных папки
  const updateFolderMutation = useMutation({
    mutationFn: async (data: {
      id: string
      name: string
      description?: string | null
      ai_naming_prompt?: string | null
      ai_check_prompt?: string | null
      knowledge_article_id?: string | null
    }) => {
      const { id, ...updateData } = data
      const { error } = await supabase
        .from('document_kit_template_folders')
        .update(updateData)
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit-folders', kitId] })
    },
    onError: () => {
      toast.error('Не удалось обновить папку')
    },
  })

  // Удаление папки из набора
  const removeFolderMutation = useMutation({
    mutationFn: async (kitFolderId: string) => {
      const { error } = await supabase
        .from('document_kit_template_folders')
        .delete()
        .eq('id', kitFolderId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit-folders', kitId] })
    },
    onError: () => {
      toast.error('Не удалось удалить папку')
    },
  })

  // Обновление порядка папок
  const reorderFoldersMutation = useMutation({
    mutationFn: async (updates: { id: string; order_index: number }[]) => {
      const results = await Promise.all(
        updates.map((update) =>
          supabase
            .from('document_kit_template_folders')
            .update({ order_index: update.order_index })
            .eq('id', update.id),
        ),
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kit-folders', kitId] })
    },
    onError: (error) => {
      logger.error('Failed to reorder folders:', error)
      toast.error('Не удалось обновить порядок папок')
      queryClient.invalidateQueries({ queryKey: ['kit-folders', kitId] })
    },
  })

  return {
    updateKitMutation,
    addFoldersMutation,
    createFolderMutation,
    updateFolderMutation,
    removeFolderMutation,
    reorderFoldersMutation,
  }
}
