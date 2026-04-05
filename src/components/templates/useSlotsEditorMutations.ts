/**
 * Хук CRUD-мутаций для редактора слотов.
 * Работает с любой таблицей слотов через SlotTableConfig.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'

export interface Slot {
  id: string
  name: string
  description: string | null
  sort_order: number
}

export interface SlotTableConfig {
  table: 'folder_template_slots' | 'document_kit_template_folder_slots'
  foreignKey: string
  foreignKeyValue: string
  queryKey: readonly unknown[]
  extraInsertFields?: Record<string, string>
}

export function useSlotsEditorMutations(config: SlotTableConfig, slots: Slot[]) {
  const queryClient = useQueryClient()

  const invalidateSlots = () => {
    queryClient.invalidateQueries({ queryKey: config.queryKey })
  }

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const maxOrder = slots.length > 0 ? Math.max(...slots.map((s) => s.sort_order || 0)) : -1

      const { error } = await supabase.from(config.table).insert({
        [config.foreignKey]: config.foreignKeyValue,
        ...config.extraInsertFields,
        name,
        sort_order: maxOrder + 1,
      } as never)

      if (error) throw error
    },
    onSuccess: invalidateSlots,
    onError: (error) => {
      logger.error('Ошибка создания слота:', error)
      toast.error('Не удалось создать слот')
    },
  })

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from(config.table).update({ name }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidateSlots,
    onError: (error) => {
      logger.error('Ошибка переименования слота:', error)
      toast.error('Не удалось переименовать слот')
    },
  })

  const updateDescriptionMutation = useMutation({
    mutationFn: async ({ id, description }: { id: string; description: string | null }) => {
      const { error } = await supabase.from(config.table).update({ description }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidateSlots,
    onError: (error) => {
      logger.error('Ошибка обновления описания слота:', error)
      toast.error('Не удалось обновить описание')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(config.table).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidateSlots,
    onError: (error) => {
      logger.error('Ошибка удаления слота:', error)
      toast.error('Не удалось удалить слот')
    },
  })

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      const results = await Promise.all(
        updates.map((update) =>
          supabase.from(config.table).update({ sort_order: update.sort_order }).eq('id', update.id),
        ),
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onSuccess: invalidateSlots,
    onError: (error) => {
      logger.error('Failed to reorder slots:', error)
      invalidateSlots()
    },
  })

  return {
    createMutation,
    renameMutation,
    updateDescriptionMutation,
    deleteMutation,
    reorderMutation,
  }
}
