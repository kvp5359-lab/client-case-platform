"use client"

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { boardKeys } from '@/hooks/queryKeys'

export type BoardItemType = 'thread' | 'project'

/**
 * Карта ручного порядка карточек по всем спискам одной доски:
 *   { [list_id]: { thread: { [item_id]: position }, project: { [item_id]: position } } }
 * Используется только списками с sort_by='manual_order'. Если у списка нет
 * записей в `board_list_item_order` — карты пустые и сортировка падает к
 * порядку по умолчанию (см. compareTasks/compareProjects).
 */
export type BoardListOrdersMap = Record<
  string,
  { thread: Record<string, number>; project: Record<string, number> }
>

export function useBoardListItemOrders(boardId: string | undefined, listIds: string[]) {
  return useQuery({
    queryKey: boardId ? boardKeys.itemOrders(boardId) : ['boards', 'item-orders', 'none'],
    enabled: !!boardId && listIds.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<BoardListOrdersMap> => {
      if (listIds.length === 0) return {}
      const { data, error } = await supabase
        .from('board_list_item_order')
        .select('list_id, item_type, item_id, position')
        .in('list_id', listIds)
      if (error) throw error
      const result: BoardListOrdersMap = {}
      for (const row of data ?? []) {
        if (!result[row.list_id]) result[row.list_id] = { thread: {}, project: {} }
        const type = row.item_type as BoardItemType
        if (type === 'thread' || type === 'project') {
          result[row.list_id][type][row.item_id] = row.position
        }
      }
      return result
    },
  })
}

type ReorderParams = {
  board_id: string
  list_id: string
  item_type: BoardItemType
  item_ids: string[]
}

export function useReorderBoardListItems() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ list_id, item_type, item_ids }: ReorderParams) => {
      const { error } = await supabase.rpc('reorder_board_list_items', {
        p_list_id: list_id,
        p_item_type: item_type,
        p_item_ids: item_ids,
      })
      if (error) throw error
    },
    onMutate: async ({ board_id, list_id, item_type, item_ids }) => {
      await qc.cancelQueries({ queryKey: boardKeys.itemOrders(board_id) })
      const prev = qc.getQueryData<BoardListOrdersMap>(boardKeys.itemOrders(board_id))
      qc.setQueryData<BoardListOrdersMap>(boardKeys.itemOrders(board_id), (old) => {
        const next: BoardListOrdersMap = { ...(old ?? {}) }
        const slot = next[list_id]
          ? { ...next[list_id] }
          : { thread: {}, project: {} }
        const fresh: Record<string, number> = {}
        item_ids.forEach((id, idx) => {
          fresh[id] = idx * 10
        })
        slot[item_type] = fresh
        next[list_id] = slot
        return next
      })
      return { prev }
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(boardKeys.itemOrders(vars.board_id), ctx.prev)
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: boardKeys.itemOrders(vars.board_id) })
    },
  })
}
