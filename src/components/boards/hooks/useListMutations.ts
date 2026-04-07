"use client"

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { boardKeys } from '@/hooks/queryKeys'
import type { BoardList, FilterGroup, SortField, SortDir, DisplayMode, VisibleField, GroupByField } from '../types'

interface CreateListParams {
  board_id: string
  name: string
  entity_type: 'task' | 'project'
  column_index?: number
  sort_order?: number
}

interface UpdateListParams {
  id: string
  board_id: string
  name?: string
  entity_type?: 'task' | 'project'
  column_index?: number
  sort_order?: number
  filters?: FilterGroup
  sort_by?: SortField
  sort_dir?: SortDir
  display_mode?: DisplayMode
  visible_fields?: VisibleField[]
  group_by?: GroupByField
}

export function useCreateList() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: CreateListParams) => {
      const { data, error } = await supabase
        .from('board_lists')
        .insert({
          board_id: params.board_id,
          name: params.name,
          entity_type: params.entity_type,
          column_index: params.column_index ?? 0,
          sort_order: params.sort_order ?? 0,
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
      const { id, board_id, filters, ...rest } = params
      void board_id // used in onSuccess
      const updatePayload: Record<string, unknown> = {
        ...rest,
        updated_at: new Date().toISOString(),
      }
      if (filters) updatePayload.filters = filters as unknown
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
