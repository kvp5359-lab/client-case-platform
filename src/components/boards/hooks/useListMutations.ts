"use client"

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { boardKeys } from '@/hooks/queryKeys'
import type { BoardList, FilterGroup, SortField, SortDir, DisplayMode, VisibleField, GroupByField, ListHeight, CardLayout } from '../types'

interface CreateListParams {
  board_id: string
  name: string
  entity_type: 'task' | 'project' | 'inbox'
  column_index?: number
  sort_order?: number
}

interface UpdateListParams {
  id: string
  board_id: string
  name?: string
  entity_type?: 'task' | 'project' | 'inbox'
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
      const { id, board_id, filters, card_layout, ...rest } = params
      void board_id // used in onSuccess
      const updatePayload: Record<string, unknown> = {
        ...rest,
        updated_at: new Date().toISOString(),
      }
      if (filters) updatePayload.filters = filters as unknown
      if (card_layout !== undefined) updatePayload.card_layout = card_layout as unknown
      const { data, error } = await supabase
        .from('board_lists')
        .update(updatePayload as never)
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
