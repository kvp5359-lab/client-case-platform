/**
 * Хук CRUD-мутаций для редактора слотов.
 * Работает с любой таблицей слотов через SlotTableConfig.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'

export type Slot = {
  id: string
  name: string
  description: string | null
  knowledge_article_id: string | null
  ai_naming_prompt: string | null
  ai_check_prompt: string | null
  sort_order: number
  /** Обратная ссылка на справочник (для резолва унаследованной статьи в редакторе). */
  slot_template_id?: string | null
  /** Встроенная статья справочника (embed) — для книжки-иконки унаследованной статьи. */
  slot_template?: { knowledge_article_id: string | null } | null
}

export type CreateSlotInput = {
  name: string
  description?: string | null
  knowledge_article_id?: string | null
  ai_naming_prompt?: string | null
  ai_check_prompt?: string | null
  /** Обратная ссылка на шаблон слота (справочник) — при добавлении из справочника. */
  slot_template_id?: string | null
}

export type UpdateSlotInput = {
  id: string
  name: string
  description: string | null
  knowledge_article_id: string | null
  ai_naming_prompt: string | null
  ai_check_prompt: string | null
}

export type SlotTableConfig = {
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
    mutationFn: async (input: string | CreateSlotInput) => {
      const maxOrder = slots.length > 0 ? Math.max(...slots.map((s) => s.sort_order || 0)) : -1
      const data = typeof input === 'string' ? { name: input } : input

      // config.table — union из 2 slot-таблиц с разными fk-колонками,
      // ключ [config.foreignKey] вычисляемый → статически не сматчить с
      // конкретной Insert-формой. Каст обоснован динамикой конфига.
      const { error } = await supabase.from(config.table).insert({
        [config.foreignKey]: config.foreignKeyValue,
        ...config.extraInsertFields,
        name: data.name,
        description: data.description ?? null,
        knowledge_article_id: data.knowledge_article_id ?? null,
        ai_naming_prompt: data.ai_naming_prompt ?? null,
        ai_check_prompt: data.ai_check_prompt ?? null,
        slot_template_id: (data as CreateSlotInput).slot_template_id ?? null,
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

  const createManyMutation = useMutation({
    mutationFn: async (inputs: CreateSlotInput[]) => {
      if (inputs.length === 0) return
      const maxOrder = slots.length > 0 ? Math.max(...slots.map((s) => s.sort_order || 0)) : -1

      // Одной вставкой и со сквозным инкрементом порядка: если добавлять по
      // одному через createMutation, каждый вызов посчитает maxOrder от того же
      // (ещё не обновлённого) списка и все слоты получат один sort_order.
      const { error } = await supabase.from(config.table).insert(
        inputs.map((data, i) => ({
          [config.foreignKey]: config.foreignKeyValue,
          ...config.extraInsertFields,
          name: data.name,
          description: data.description ?? null,
          knowledge_article_id: data.knowledge_article_id ?? null,
          ai_naming_prompt: data.ai_naming_prompt ?? null,
          ai_check_prompt: data.ai_check_prompt ?? null,
          slot_template_id: data.slot_template_id ?? null,
          sort_order: maxOrder + 1 + i,
        })) as never,
      )

      if (error) throw error
    },
    onSuccess: invalidateSlots,
    onError: (error) => {
      logger.error('Ошибка добавления слотов:', error)
      toast.error('Не удалось добавить слоты')
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

  const updateMutation = useMutation({
    mutationFn: async (input: UpdateSlotInput) => {
      const { id, ...rest } = input
      // config.table — union из 2 slot-таблиц; supabase-js не сводит Update-форму
      // по union к одной → каст. Поля общие для обеих таблиц.
      const { error } = await supabase
        .from(config.table)
        .update({
          name: rest.name,
          description: rest.description,
          knowledge_article_id: rest.knowledge_article_id,
          ai_naming_prompt: rest.ai_naming_prompt,
          ai_check_prompt: rest.ai_check_prompt,
        } as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidateSlots,
    onError: (error) => {
      logger.error('Ошибка обновления слота:', error)
      toast.error('Не удалось обновить слот')
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
    createManyMutation,
    renameMutation,
    updateMutation,
    deleteMutation,
    reorderMutation,
  }
}
