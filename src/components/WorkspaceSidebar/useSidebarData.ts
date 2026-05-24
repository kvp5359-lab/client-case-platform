"use client"

import { useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { workspaceKeys, sidebarKeys, sidebarMetaKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { Workspace, Participant } from '@/types/entities'
import type { Database } from '@/types/database'

type WorkspaceWithParticipant = {
  participant?: Participant
} & Workspace

type ProjectRow = Database['public']['Tables']['projects']['Row']

/**
 * Расширенный тип проекта с уже посчитанной иконкой и её цветом для сайдбара.
 *
 * `iconId` берётся из `project_templates.icon`.
 * `iconColor` рассчитывается по `project_templates.icon_color_mode`:
 *   - 'fixed'  → всегда `project_templates.icon_color`
 *   - 'status' → цвет статуса проекта (statuses.color);
 *                fallback в чёрный (#000000), если статус не задан.
 *
 * Если у проекта нет шаблона — поля undefined, ProjectListItem рисует
 * дефолтную папку в дефолтном сером.
 */
export type Project = ProjectRow & {
  iconId?: string | null
  iconColor?: string
}

type UseSidebarDataOptions = {
  workspaceId?: string
  /** Строка поиска из сайдбара (уже дебаунснутая). Если ≥ 2 символов — активирует серверный поиск. */
  searchQuery?: string
  /**
   * ID проектов с непрочитанными сообщениями (от useSidebarInboxCounts).
   * Те из них, что не попали в топ-35 по last_activity_at, подгружаются отдельным запросом
   * и добавляются в `projects`, чтобы непрочитанные не выпадали из сайдбара.
   */
  unreadProjectIds?: string[]
}

export function useSidebarData({ workspaceId, searchQuery, unreadProjectIds }: UseSidebarDataOptions) {
  const { user } = useAuth()
  const permissionsResult = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  const queryClient = useQueryClient()

  // --- Workspaces ---
  const { data: workspaces = [], isLoading: loadingWorkspaces } = useQuery<
    WorkspaceWithParticipant[]
  >({
    queryKey: workspaceKeys.userWorkspaces(user?.email ?? ''),
    queryFn: async () => {
      const { data: participants, error } = await supabase
        .from('participants')
        .select('*, workspaces:workspace_id(*)')
        .eq('email', user!.email!.toLowerCase())
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })

      if (error) throw error

      return (
        participants
          ?.filter((p) => {
            const ws = p.workspaces as Workspace | null
            return ws != null && !ws.is_deleted
          })
          .map((p) => {
            const ws = p.workspaces as Workspace
            return { ...ws, participant: p as Participant }
          }) ?? []
      )
    },
    enabled: !!user?.email,
    staleTime: STALE_TIME.LONG,
  })

  // --- Projects (permission-aware) ---
  const canViewAll = permissionsResult.can('view_all_projects')

  const { data: projects = [], isLoading: loadingProjects } = useQuery<Project[]>({
    queryKey: sidebarKeys.projects(workspaceId ?? '', canViewAll),
    queryFn: async () => {
      if (canViewAll) {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('workspace_id', workspaceId!)
          .eq('is_deleted', false)
          .order('last_activity_at', { ascending: false })
          .limit(35)

        if (error) throw error
        return data ?? []
      }

      const { data: participant } = await supabase
        .from('participants')
        .select('id')
        .eq('workspace_id', workspaceId!)
        .eq('user_id', user?.id ?? '')
        .eq('is_deleted', false)
        .maybeSingle()

      if (!participant) return []

      const { data: projectParticipants, error: ppError } = await supabase
        .from('project_participants')
        .select('project_id')
        .eq('participant_id', participant.id)

      if (ppError) throw ppError

      const projectIds = projectParticipants?.map((pp) => pp.project_id) ?? []
      if (projectIds.length === 0) return []

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .eq('is_deleted', false)
        .in('id', projectIds)
        .order('last_activity_at', { ascending: false })
        .limit(35)

      if (error) throw error
      return data ?? []
    },
    enabled: !!workspaceId && !permissionsResult.isLoading,
    staleTime: STALE_TIME.MEDIUM,
  })

  // --- Догрузка проектов с непрочитанными, выпавших из топ-35 ---
  // Берём только те ID, которых нет в основной выборке. canViewAll учитываем в ключе:
  // у пользователя без прав смысл "проекты по ID" другой (он всё равно увидит только свои
  // через RLS, но кэш разделяем, чтобы не отдать чужой набор).
  const missingUnreadIds = useMemo(() => {
    if (!unreadProjectIds || unreadProjectIds.length === 0) return []
    const present = new Set(projects.map((p) => p.id))
    return unreadProjectIds.filter((id) => !present.has(id))
  }, [unreadProjectIds, projects])

  const { data: extraUnreadProjects = [] } = useQuery<Project[]>({
    queryKey: sidebarKeys.projectsByIds(workspaceId ?? '', canViewAll, missingUnreadIds),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .eq('is_deleted', false)
        .in('id', missingUnreadIds)
      if (error) throw error
      return data ?? []
    },
    enabled: !!workspaceId && !permissionsResult.isLoading && missingUnreadIds.length > 0,
    staleTime: STALE_TIME.MEDIUM,
  })

  // Объединяем: к топу по активности добавляем «выпавшие непрочитанные».
  // Сортировку «непрочитанные сверху» делает ProjectsList.
  const projectsWithUnread = useMemo<Project[]>(() => {
    if (extraUnreadProjects.length === 0) return projects
    return [...projects, ...extraUnreadProjects]
  }, [projects, extraUnreadProjects])

  // --- Serverside search (активируется при длине запроса ≥ 2) ---
  const trimmedSearch = (searchQuery ?? '').trim()
  const isSearching = trimmedSearch.length >= 2

  const { data: searchResults = [], isLoading: loadingSearch } = useQuery<Project[]>({
    queryKey: sidebarKeys.projectsSearch(workspaceId ?? '', canViewAll, trimmedSearch),
    queryFn: async () => {
      // Экранируем спецсимволы ilike (% _ \) чтобы ввод пользователя не превратился в подстановку
      const pattern = `%${trimmedSearch.replace(/[\\%_]/g, '\\$&')}%`

      if (canViewAll) {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('workspace_id', workspaceId!)
          .eq('is_deleted', false)
          .ilike('name', pattern)
          .order('last_activity_at', { ascending: false })
          .limit(50)

        if (error) throw error
        return data ?? []
      }

      const { data: participant } = await supabase
        .from('participants')
        .select('id')
        .eq('workspace_id', workspaceId!)
        .eq('user_id', user?.id ?? '')
        .eq('is_deleted', false)
        .maybeSingle()

      if (!participant) return []

      const { data: projectParticipants, error: ppError } = await supabase
        .from('project_participants')
        .select('project_id')
        .eq('participant_id', participant.id)

      if (ppError) throw ppError

      const projectIds = projectParticipants?.map((pp) => pp.project_id) ?? []
      if (projectIds.length === 0) return []

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .eq('is_deleted', false)
        .in('id', projectIds)
        .ilike('name', pattern)
        .order('last_activity_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return data ?? []
    },
    enabled: !!workspaceId && !permissionsResult.isLoading && isSearching,
    staleTime: STALE_TIME.SHORT,
  })

  // При активном поиске отдаём серверные результаты вместо топа.
  const projectsBeforeEnrich = isSearching ? searchResults : projectsWithUnread
  const effectiveLoadingProjects = isSearching ? loadingSearch : loadingProjects

  // --- Шаблоны и статусы воркспейса для иконок проектов в сайдбаре ---
  // Грузим отдельными лёгкими запросами (несколько строк) и мерджим в проекты.
  // Так не зависим от различий one-to-one / many-to-one в PostgREST embedded select.
  type TemplateMeta = {
    icon: string | null
    icon_color_mode: 'status' | 'fixed'
    icon_color: string
  }
  const { data: templatesById } = useQuery<Record<string, TemplateMeta>>({
    queryKey: sidebarMetaKeys.templatesIcons(workspaceId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_templates')
        .select('id, icon, icon_color_mode, icon_color')
        .eq('workspace_id', workspaceId!)
      if (error) throw error
      const map: Record<string, TemplateMeta> = {}
      for (const row of data ?? []) {
        map[row.id] = {
          icon: row.icon,
          icon_color_mode: (row.icon_color_mode === 'fixed' ? 'fixed' : 'status'),
          icon_color: row.icon_color,
        }
      }
      return map
    },
    enabled: !!workspaceId,
    staleTime: STALE_TIME.MEDIUM,
  })

  const { data: statusesById } = useQuery<Record<string, { color: string }>>({
    queryKey: sidebarMetaKeys.statusesColors(workspaceId ?? ''),
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
    enabled: !!workspaceId,
    staleTime: STALE_TIME.MEDIUM,
  })

  // Fallback цвет, если режим 'status' но у проекта нет статуса —
  // чёрный (по требованию).
  const STATUS_FALLBACK_COLOR = '#000000'

  // Обогащаем каждый проект готовыми `iconId` и `iconColor` для отрисовки в сайдбаре.
  const effectiveProjects = useMemo<Project[]>(() => {
    if (!templatesById && !statusesById) return projectsBeforeEnrich
    return projectsBeforeEnrich.map((p) => {
      const tpl = p.template_id ? templatesById?.[p.template_id] : undefined
      if (!tpl) return p
      const iconId = tpl.icon
      const iconColor =
        tpl.icon_color_mode === 'fixed'
          ? tpl.icon_color
          : (p.status_id && statusesById?.[p.status_id]?.color) || STATUS_FALLBACK_COLOR
      return { ...p, iconId, iconColor }
    })
  }, [projectsBeforeEnrich, templatesById, statusesById])

  const currentWorkspace = workspaces.find((w) => w.id === workspaceId)

  // Диагностика: если у пользователя пустой список воркспейсов, это может
  // означать либо реальное отсутствие доступа (новый юзер), либо протухший
  // JWT — middleware пускает на cookie, но Supabase-сервер видит anon и RLS
  // отсекает participants. Проверяем через getUser() (валидирует токен);
  // при ошибке — signOut + редирект на /login?expired=1.
  const expiredCheckRef = useRef(false)
  useEffect(() => {
    if (loadingWorkspaces) return
    if (workspaces.length > 0) return
    if (!user) return
    if (expiredCheckRef.current) return
    expiredCheckRef.current = true

    let cancelled = false
    const check = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (cancelled) return
      if (error || !data.user) {
        await supabase.auth.signOut()
        if (typeof window !== 'undefined') {
          window.location.href = '/login?expired=1'
        }
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [loadingWorkspaces, workspaces.length, user])

  // B-108: invalidate ALL sidebar project keys for workspace (stable base key)
  const refreshProjects = () => {
    if (workspaceId) {
      queryClient.invalidateQueries({ queryKey: sidebarKeys.projectsBase(workspaceId) })
    }
  }

  return {
    workspaces,
    projects: effectiveProjects,
    loadingWorkspaces,
    loadingProjects: effectiveLoadingProjects,
    isSearching,
    currentWorkspace,
    permissionsResult,
    refreshProjects,
  }
}
