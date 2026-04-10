"use client"

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { boardKeys } from '@/hooks/queryKeys'
import type { Board } from '../types'

interface CreateBoardParams {
  workspace_id: string
  name: string
  description?: string
  access_type?: 'workspace' | 'private' | 'custom'
  access_roles?: string[]
  created_by: string
}

interface UpdateBoardParams {
  id: string
  workspace_id: string
  name?: string
  description?: string
  access_type?: 'workspace' | 'private' | 'custom'
  access_roles?: string[]
  column_widths?: number[]
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
      return data as Board
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: boardKeys.byWorkspace(vars.workspace_id) })
    },
  })
}

export function useUpdateBoard() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: UpdateBoardParams) => {
      const { id, workspace_id, ...updates } = params
      void workspace_id // used in onSuccess
      const { data, error } = await supabase
        .from('boards')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Board
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: boardKeys.byWorkspace(vars.workspace_id) })
      qc.invalidateQueries({ queryKey: boardKeys.detail(vars.id) })
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
