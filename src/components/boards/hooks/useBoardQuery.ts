"use client"

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { boardKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { Board, BoardList } from '../types'

/** Загрузка доски по ID */
export function useBoardDetail(boardId: string | undefined) {
  return useQuery({
    queryKey: boardKeys.detail(boardId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('boards')
        .select('*')
        .eq('id', boardId!)
        .single()
      if (error) throw error
      return data as Board
    },
    enabled: !!boardId,
    staleTime: STALE_TIME.SHORT,
  })
}

/** Загрузка списков доски */
export function useBoardLists(boardId: string | undefined) {
  return useQuery({
    queryKey: boardKeys.lists(boardId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_board_lists', {
        p_board_id: boardId!,
      })
      if (error) throw error
      return (data ?? []) as unknown as BoardList[]
    },
    enabled: !!boardId,
    staleTime: STALE_TIME.SHORT,
  })
}
