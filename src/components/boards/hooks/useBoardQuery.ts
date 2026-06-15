"use client"

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { boardKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { BoardList } from '../types'

/** participant_id'ы с доступом к доске (access_type='custom'). */
export function useBoardMembers(boardId: string | undefined) {
  return useQuery({
    queryKey: boardKeys.members(boardId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('board_members')
        .select('participant_id')
        .eq('board_id', boardId!)
      if (error) throw error
      return (data ?? []).map((r) => r.participant_id as string)
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
