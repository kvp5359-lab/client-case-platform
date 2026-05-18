/**
 * Хуки глобального поиска и «Недавнее».
 *
 * Поиск: FTS (russian) + pg_trgm (fuzzy на опечатки) через RPC global_search.
 * Возвращает результаты по 5 типам сущностей: thread, project, knowledge_article,
 * participant, message (упоминание в треде со сниппетом).
 *
 * Recent: track_recent_view (UPSERT при открытии) + get_recently_viewed
 * (резолвит сущности, фильтрует is_deleted).
 */

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { globalSearchKeys, recentlyViewedKeys } from '@/hooks/queryKeys'

export type GlobalSearchEntityType =
  | 'thread'
  | 'project'
  | 'knowledge_article'
  | 'participant'
  | 'message'

export type RecentEntityType = Exclude<GlobalSearchEntityType, 'message'>

export interface GlobalSearchRow {
  entity_type: GlobalSearchEntityType
  entity_id: string
  title: string | null
  subtitle: string | null
  /** ts_headline сниппет с <mark>…</mark> (для message и knowledge_article). */
  snippet: string | null
  rank: number
  project_id: string | null
  thread_type: string | null
  /** Для message — id треда (чтобы открыть нужный тред). Для thread — равен entity_id. */
  thread_id: string | null
}

export interface RecentlyViewedRow {
  entity_type: RecentEntityType
  entity_id: string
  title: string | null
  subtitle: string | null
  project_id: string | null
  thread_type: string | null
  opened_at: string
}

/**
 * Глобальный поиск. Включается при query.length >= 2.
 * Debounce делайте на стороне вызывающего (см. useDebouncedValue в компоненте).
 */
export function useGlobalSearch(workspaceId: string | undefined, debouncedQuery: string) {
  const query = debouncedQuery.trim()
  return useQuery({
    queryKey: globalSearchKeys.byWorkspaceQuery(workspaceId ?? '', query),
    enabled: Boolean(workspaceId) && query.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<GlobalSearchRow[]> => {
      const { data, error } = await supabase.rpc('global_search' as never, {
        p_workspace_id: workspaceId!,
        p_query: query,
        p_limit: 8,
      } as never)
      if (error) throw error
      return (data as GlobalSearchRow[] | null) ?? []
    },
  })
}

/**
 * Последние открытые элементы (треды/проекты/статьи/контакты) в этом воркспейсе.
 */
export function useRecentlyViewed(workspaceId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: recentlyViewedKeys.byWorkspace(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
    queryFn: async (): Promise<RecentlyViewedRow[]> => {
      const { data, error } = await supabase.rpc('get_recently_viewed' as never, {
        p_workspace_id: workspaceId!,
        p_limit: limit,
      } as never)
      if (error) throw error
      return (data as RecentlyViewedRow[] | null) ?? []
    },
  })
}

/**
 * Зафиксировать факт «пользователь открыл сущность». UPSERT по PK
 * (user, workspace, entity_type, entity_id) → обновляет opened_at = now().
 *
 * Вызывайте из useEffect на маунте страницы сущности. Идемпотентно.
 */
export function useTrackRecentView() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      workspaceId: string
      entityType: RecentEntityType
      entityId: string
    }) => {
      const { error } = await supabase.rpc('track_recent_view' as never, {
        p_workspace_id: params.workspaceId,
        p_entity_type: params.entityType,
        p_entity_id: params.entityId,
      } as never)
      if (error) throw error
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({
        queryKey: recentlyViewedKeys.byWorkspace(params.workspaceId),
      })
    },
  })
}

/**
 * Удобная обёртка: автоматически фиксирует просмотр при маунте/смене id.
 * Сама обрабатывает enabled=false для случая отсутствия id или workspace.
 */
export function useAutoTrackRecentView(
  workspaceId: string | undefined,
  entityType: RecentEntityType,
  entityId: string | undefined,
) {
  const { mutate } = useTrackRecentView()
  useEffect(() => {
    if (!workspaceId || !entityId) return
    mutate({ workspaceId, entityType, entityId })
  }, [workspaceId, entityType, entityId, mutate])
}

/**
 * Простой debounce для строки. 250ms по умолчанию (стандарт сайдбара).
 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}
