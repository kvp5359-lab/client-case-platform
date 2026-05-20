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

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  globalSearchKeys,
  recentlyViewedKeys,
  sidebarMetaKeys,
  STALE_TIME,
} from '@/hooks/queryKeys'

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
  /** Цвет треда (только для thread/message). Для остального — null. */
  accent_color: string | null
  /** template_id проекта (для резолва иконки/цвета проекта-результата и проекта-родителя треда). */
  project_template_id: string | null
  /** status_id проекта (для режима icon_color_mode='status'). */
  project_status_id: string | null
}

export interface RecentlyViewedRow {
  entity_type: RecentEntityType
  entity_id: string
  title: string | null
  subtitle: string | null
  project_id: string | null
  thread_type: string | null
  /** Цвет треда (только для thread). Для остального — null. */
  accent_color: string | null
  project_template_id: string | null
  project_status_id: string | null
  opened_at: string
}

/**
 * Глобальный поиск. Включается при query.length >= 2.
 * Debounce делайте на стороне вызывающего (см. useDebouncedValue в компоненте).
 *
 * `limit` — сколько результатов на ТИП сущности (RPC возвращает union из 5 типов).
 * Дефолт 8 — для popover в сайдбаре. Страница /search использует ~40.
 */
export function useGlobalSearch(
  workspaceId: string | undefined,
  debouncedQuery: string,
  limit = 8,
) {
  const query = debouncedQuery.trim()
  return useQuery({
    queryKey: [...globalSearchKeys.byWorkspaceQuery(workspaceId ?? '', query), limit] as const,
    enabled: Boolean(workspaceId) && query.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<GlobalSearchRow[]> => {
      const { data, error } = await supabase.rpc('global_search' as never, {
        p_workspace_id: workspaceId!,
        p_query: query,
        p_limit: limit,
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
 *
 * Debounce 600ms: при быстром переключении между тредами (или быстрой
 * навигации между проектами/статьями) запись делается только для того,
 * на котором юзер реально задержался. Иначе пачка RPC на каждый клик.
 */
export function useAutoTrackRecentView(
  workspaceId: string | undefined,
  entityType: RecentEntityType,
  entityId: string | undefined,
) {
  const { mutate } = useTrackRecentView()
  useEffect(() => {
    if (!workspaceId || !entityId) return
    const t = setTimeout(() => {
      mutate({ workspaceId, entityType, entityId })
    }, 600)
    return () => clearTimeout(t)
  }, [workspaceId, entityType, entityId, mutate])
}

/** template_id → {icon, icon_color_mode, icon_color}. */
export interface ProjectTemplateMeta {
  icon: string | null
  icon_color_mode: 'status' | 'fixed'
  icon_color: string
}

/**
 * Карта `template_id → meta`. Использует тот же queryKey, что и сайдбар —
 * кэш переиспользуется (без второго похода в БД).
 */
export function useProjectTemplateIcons(workspaceId: string | undefined) {
  return useQuery<Record<string, ProjectTemplateMeta>>({
    queryKey: sidebarMetaKeys.templatesIcons(workspaceId ?? ''),
    enabled: !!workspaceId,
    staleTime: STALE_TIME.MEDIUM,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_templates')
        .select('id, icon, icon_color_mode, icon_color')
        .eq('workspace_id', workspaceId!)
      if (error) throw error
      const map: Record<string, ProjectTemplateMeta> = {}
      for (const row of data ?? []) {
        map[row.id] = {
          icon: row.icon,
          icon_color_mode: row.icon_color_mode === 'fixed' ? 'fixed' : 'status',
          icon_color: row.icon_color,
        }
      }
      return map
    },
  })
}

/**
 * Карта `status_id → color` для project-статусов. Тот же queryKey, что у сайдбара.
 */
export function useProjectStatusColors(workspaceId: string | undefined) {
  return useQuery<Record<string, { color: string }>>({
    queryKey: sidebarMetaKeys.statusesColors(workspaceId ?? ''),
    enabled: !!workspaceId,
    staleTime: STALE_TIME.MEDIUM,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('statuses')
        .select('id, color')
        .eq('workspace_id', workspaceId!)
        .eq('entity_type', 'project')
      if (error) throw error
      const map: Record<string, { color: string }> = {}
      for (const row of data ?? []) map[row.id] = { color: row.color }
      return map
    },
  })
}

/**
 * Резолвит {iconId, iconColor} проекта по тем же правилам, что useSidebarData:
 * icon — из template; цвет — fixed (template.icon_color) или from-status
 * (statuses.color по project.status_id), fallback чёрный.
 */
export function resolveProjectIcon(
  templateId: string | null,
  statusId: string | null,
  templatesById: Record<string, ProjectTemplateMeta> | undefined,
  statusesById: Record<string, { color: string }> | undefined,
): { iconId: string | null; iconColor: string } {
  const tpl = templateId ? templatesById?.[templateId] : undefined
  if (!tpl) return { iconId: null, iconColor: '#000000' }
  const iconColor =
    tpl.icon_color_mode === 'fixed'
      ? tpl.icon_color
      : (statusId && statusesById?.[statusId]?.color) || '#000000'
  return { iconId: tpl.icon, iconColor }
}

/** Обёртка: подгружает обе карты и возвращает резолвер для текущего workspace. */
export function useProjectIconResolver(workspaceId: string | undefined) {
  const { data: templatesById } = useProjectTemplateIcons(workspaceId)
  const { data: statusesById } = useProjectStatusColors(workspaceId)
  return useMemo(
    () =>
      (templateId: string | null, statusId: string | null) =>
        resolveProjectIcon(templateId, statusId, templatesById, statusesById),
    [templatesById, statusesById],
  )
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
