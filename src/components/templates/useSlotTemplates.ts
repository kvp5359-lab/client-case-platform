/**
 * Справочник шаблонов слотов воркспейса: чтение и запись.
 *
 * Одно место на всех потребителей — справочник в настройках и пикер
 * «Из справочника». Раньше они ходили в один и тот же ключ кэша разными
 * запросами с разной сортировкой, и порядок в пикере зависел от того, открывал
 * ли пользователь до этого справочник; а вставку шаблона каждый писал сам, и
 * набор полей приходилось помнить в трёх местах.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { slotTemplatesKeys } from '@/hooks/queryKeys'
import { fetchNextOrderIndex } from './nextOrderIndex'
import type { Database } from '@/types/database'

export type SlotTemplate = Database['public']['Tables']['slot_templates']['Row']

/** Поля шаблона, которыми управляет форма (всё остальное — служебное). */
export type SlotTemplateInput = {
  name: string
  comment?: string | null
  description: string | null
  knowledge_article_id: string | null
  ai_naming_prompt: string | null
  ai_check_prompt: string | null
}

export function useSlotTemplates(workspaceId: string | undefined, enabled = true) {
  return useQuery<SlotTemplate[]>({
    queryKey: slotTemplatesKeys.byWorkspace(workspaceId ?? ''),
    queryFn: async () => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('slot_templates')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!workspaceId && enabled,
  })
}

/** Поля для insert/update — чтобы их набор не расходился между вставкой и правкой. */
export function slotTemplateFields(input: SlotTemplateInput) {
  return {
    name: input.name,
    comment: input.comment ?? null,
    description: input.description,
    knowledge_article_id: input.knowledge_article_id,
    ai_naming_prompt: input.ai_naming_prompt,
    ai_check_prompt: input.ai_check_prompt,
  }
}

/**
 * Создать шаблон слота в справочнике. Зовут и настройки, и пикер, и копирование.
 * Возвращает id новой записи.
 *
 * Порядок — в конец списка: с дефолтом колонки (0) новая запись делила бы первое
 * место с существующей строкой, а при равных значениях порядок между ними не
 * определён.
 */
export async function insertSlotTemplate(
  workspaceId: string | undefined,
  input: SlotTemplateInput,
): Promise<string> {
  const { data, error } = await supabase
    .from('slot_templates')
    .insert({
      workspace_id: workspaceId ?? '',
      ...slotTemplateFields(input),
      sort_order: await fetchNextOrderIndex({
        table: 'slot_templates',
        workspaceId,
        column: 'sort_order',
      }),
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}
