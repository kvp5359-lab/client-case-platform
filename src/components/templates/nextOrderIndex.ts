/**
 * Порядок для новой строки справочника шаблонов — в конец списка.
 *
 * Без этого новая запись получает дефолт колонки (0) и делит первое место с
 * существующей строкой, а при равных значениях порядок между ними не определён —
 * строки прыгают при каждом обновлении.
 *
 * Гонка: два одновременных создания дадут одинаковый порядок. Для справочников,
 * которые правят вручную и редко, это приемлемо; если станет важно — считать
 * порядок в БД (триггером или DEFAULT из последовательности).
 */

import { supabase } from '@/lib/supabase'

/** Таблицы справочников шаблонов с ручным порядком. */
type OrderedTemplateTable = 'folder_templates' | 'document_kit_templates' | 'slot_templates'

type NextOrderIndexOptions = {
  table: OrderedTemplateTable
  workspaceId: string | undefined
  /**
   * Колонка порядка. У folder_templates и document_kit_templates это
   * order_index, у slot_templates исторически sort_order (как и у слотов
   * внутри папок).
   */
  column: 'order_index' | 'sort_order'
}

type OrderRow = { order_index?: number | null; sort_order?: number | null }

export async function fetchNextOrderIndex({
  table,
  workspaceId,
  column,
}: NextOrderIndexOptions): Promise<number> {
  // Имя таблицы и колонки выбирается в рантайме — supabase-js не выводит на это
  // per-table типы. Форма ответа проверяется ниже через OrderRow.
  const { data } = await supabase
    .from(table)
    .select(column)
    .eq('workspace_id', workspaceId ?? '')
    .order(column, { ascending: false })
    .limit(1)
    .maybeSingle<OrderRow>()

  const current = data?.[column]
  return (current ?? -1) + 1
}
