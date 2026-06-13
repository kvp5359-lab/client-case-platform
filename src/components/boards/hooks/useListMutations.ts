"use client"

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { boardKeys } from '@/hooks/queryKeys'
import { toSupabaseJson } from '@/utils/supabaseJson'
import type { TablesUpdate, TablesInsert } from '@/types/database'
import type { BoardList, DisplayMode, VisibleField, GroupByField, ListHeight, CardLayout, CalendarSettings } from '../types'
import type { FilterGroup, SortField, SortDir } from '@/lib/filters/types'

type CreateListParams = {
  board_id: string
  name: string
  entity_type: 'thread' | 'project' | 'inbox'
  display_mode?: DisplayMode
  column_index?: number
  sort_order?: number
}

type UpdateListParams = {
  id: string
  board_id: string
  name?: string
  entity_type?: 'thread' | 'project' | 'inbox'
  column_index?: number
  sort_order?: number
  filters?: FilterGroup
  sort_by?: SortField
  sort_dir?: SortDir
  display_mode?: DisplayMode
  visible_fields?: VisibleField[]
  group_by?: GroupByField
  list_height?: ListHeight
  header_color?: string | null
  card_layout?: CardLayout | null
  calendar_settings?: CalendarSettings | null
}

export function useCreateList() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: CreateListParams) => {
      const columnIndex = params.column_index ?? 0
      let sortOrder = params.sort_order
      if (sortOrder === undefined) {
        const { data: maxRow } = await supabase
          .from('board_lists')
          .select('sort_order')
          .eq('board_id', params.board_id)
          .eq('column_index', columnIndex)
          .order('sort_order', { ascending: false })
          .limit(1)
          .maybeSingle()
        sortOrder = maxRow ? (maxRow as { sort_order: number }).sort_order + 1 : 0
      }
      const { data, error } = await supabase
        .from('board_lists')
        .insert({
          board_id: params.board_id,
          name: params.name,
          entity_type: params.entity_type,
          ...(params.display_mode ? { display_mode: params.display_mode } : {}),
          column_index: columnIndex,
          sort_order: sortOrder,
        })
        .select()
        .single()
      if (error) throw error
      return data as unknown as BoardList
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: boardKeys.lists(vars.board_id) })
    },
  })
}

export function useUpdateList() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: UpdateListParams) => {
      const { id, board_id, filters, card_layout, calendar_settings, ...rest } = params
      void board_id // used in onSuccess
      const updatePayload: TablesUpdate<'board_lists'> = {
        ...rest,
        updated_at: new Date().toISOString(),
      }
      if (filters) updatePayload.filters = toSupabaseJson(filters)
      if (card_layout !== undefined) updatePayload.card_layout = toSupabaseJson(card_layout)
      if (calendar_settings !== undefined)
        updatePayload.calendar_settings = toSupabaseJson(calendar_settings)
      const { data, error } = await supabase
        .from('board_lists')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as unknown as BoardList
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: boardKeys.lists(vars.board_id) })
    },
  })
}

export function useSwapListOrder() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ listAId, listBId }: { listAId: string; listBId: string; board_id: string }) => {
      const { error } = await supabase.rpc('swap_board_list_sort_order', {
        p_list_a_id: listAId,
        p_list_b_id: listBId,
      })
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: boardKeys.lists(vars.board_id) })
    },
  })
}

type ReorderListsParams = {
  board_id: string
  updates: Array<{ id: string; column_index: number; sort_order: number }>
}

export function useReorderLists() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ updates }: ReorderListsParams) => {
      // Шлём апдейты параллельно. Без uniq-индекса по (board_id, column_index, sort_order)
      // гонок не будет, а у нас шаг 10 между значениями.
      await Promise.all(
        updates.map((u) =>
          supabase
            .from('board_lists')
            .update({ column_index: u.column_index, sort_order: u.sort_order, updated_at: new Date().toISOString() })
            .eq('id', u.id),
        ),
      )
    },
    onMutate: async ({ board_id, updates }) => {
      await qc.cancelQueries({ queryKey: boardKeys.lists(board_id) })
      const prev = qc.getQueryData<BoardList[]>(boardKeys.lists(board_id))
      if (prev) {
        const map = new Map(updates.map((u) => [u.id, u]))
        const next = prev.map((l) => {
          const u = map.get(l.id)
          return u ? { ...l, column_index: u.column_index, sort_order: u.sort_order } : l
        })
        qc.setQueryData(boardKeys.lists(board_id), next)
      }
      return { prev }
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(boardKeys.lists(vars.board_id), ctx.prev)
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: boardKeys.lists(vars.board_id) })
    },
  })
}

/**
 * Дублирует board_list со всеми настройками отображения, фильтрами, layout-ом.
 * Копия встаёт в самый низ той же колонки. К имени добавляется « (копия)».
 */
export function useDuplicateList() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, board_id }: { id: string; board_id: string }) => {
      void board_id // used in onSuccess
      // 1) читаем исходный список целиком
      const { data: src, error: srcErr } = await supabase
        .from('board_lists')
        .select('*')
        .eq('id', id)
        .single()
      if (srcErr || !src) throw srcErr ?? new Error('Список не найден')
      const source = src as unknown as BoardList

      // 2) считаем sort_order для копии — в конец той же колонки
      const { data: maxRow } = await supabase
        .from('board_lists')
        .select('sort_order')
        .eq('board_id', source.board_id)
        .eq('column_index', source.column_index)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      const nextSortOrder = maxRow
        ? (maxRow as { sort_order: number }).sort_order + 1
        : 0

      // 3) вставляем копию со всеми параметрами оригинала
      const copyPayload: TablesInsert<'board_lists'> = {
        board_id: source.board_id,
        name: `${source.name} (копия)`,
        entity_type: source.entity_type,
        column_index: source.column_index,
        sort_order: nextSortOrder,
        filters: toSupabaseJson(source.filters),
        sort_by: source.sort_by,
        sort_dir: source.sort_dir,
        display_mode: source.display_mode,
        visible_fields: source.visible_fields,
        group_by: source.group_by,
        list_height: source.list_height,
        header_color: source.header_color,
        card_layout: toSupabaseJson(source.card_layout),
        calendar_settings: toSupabaseJson(source.calendar_settings),
      }
      const { data, error } = await supabase
        .from('board_lists')
        .insert(copyPayload)
        .select()
        .single()
      if (error) throw error
      return data as unknown as BoardList
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: boardKeys.lists(vars.board_id) })
    },
  })
}

export function useDeleteList() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string; board_id: string }) => {
      const { error } = await supabase.from('board_lists').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: boardKeys.lists(vars.board_id) })
    },
  })
}
