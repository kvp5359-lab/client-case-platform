"use client"

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { boardKeys } from '@/hooks/queryKeys'
import type { Board, BoardGlobalFilter } from '../types'
import type { Database } from '@/types/database'

type CreateBoardParams = {
  workspace_id: string
  name: string
  description?: string
  access_type?: 'workspace' | 'private' | 'custom'
  access_roles?: string[]
  created_by: string
  /** participant_id'ы для access_type='custom' (board_members). */
  memberIds?: string[]
}

type UpdateBoardParams = {
  id: string
  workspace_id: string
  name?: string
  description?: string
  access_type?: 'workspace' | 'private' | 'custom'
  access_roles?: string[]
  column_widths?: number[]
  /** Фильтр на уровне всей доски (этап 4.1) */
  global_filter?: BoardGlobalFilter
  /** Если задано — пересинхронить board_members этим набором participant_id'ов. */
  memberIds?: string[]
}

export function useCreateBoard() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: CreateBoardParams) => {
      const { data, error } = await supabase
        .from('boards')
        .insert({
          workspace_id: params.workspace_id,
          name: params.name,
          description: params.description ?? null,
          access_type: params.access_type ?? 'workspace',
          access_roles: params.access_roles ?? [],
          created_by: params.created_by,
        })
        .select()
        .single()
      if (error) throw error
      const board = data as unknown as Board
      // Конкретные участники (access_type='custom') → board_members.
      if (params.memberIds && params.memberIds.length > 0) {
        const rows = params.memberIds.map((pid) => ({
          board_id: board.id,
          participant_id: pid,
        }))
        const { error: mErr } = await supabase.from('board_members').insert(rows)
        if (mErr) throw mErr
      }
      return board
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: boardKeys.byWorkspace(vars.workspace_id) })
      qc.invalidateQueries({ queryKey: boardKeys.members(data.id) })
    },
  })
}

export function useUpdateBoard() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: UpdateBoardParams) => {
      // memberIds — не колонка boards, синхроним отдельно в board_members.
      const { id, workspace_id, memberIds, ...updates } = params
      void workspace_id // used in onSuccess
      const { data, error } = await supabase
        .from('boards')
        // BoardGlobalFilter — интерфейс, Supabase ждёт Json (index-signature тип).
        // Структурно совместимы — каст безопасен.
        .update({ ...updates, updated_at: new Date().toISOString() } as unknown as Database['public']['Tables']['boards']['Update'])
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      // Пересинхрон участников: полностью заменяем набор (delete + insert).
      if (memberIds !== undefined) {
        const { error: dErr } = await supabase.from('board_members').delete().eq('board_id', id)
        if (dErr) throw dErr
        if (memberIds.length > 0) {
          const rows = memberIds.map((pid) => ({ board_id: id, participant_id: pid }))
          const { error: iErr } = await supabase.from('board_members').insert(rows)
          if (iErr) throw iErr
        }
      }
      return data as unknown as Board
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: boardKeys.byWorkspace(vars.workspace_id) })
      qc.invalidateQueries({ queryKey: boardKeys.detail(vars.id) })
      qc.invalidateQueries({ queryKey: boardKeys.members(data.id) })
    },
  })
}

export function useDeleteBoard() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string; workspace_id: string }) => {
      const { error } = await supabase.from('boards').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: boardKeys.byWorkspace(vars.workspace_id) })
    },
  })
}
