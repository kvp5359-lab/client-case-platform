"use client"

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { boardKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { BoardList } from '../types'

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
