"use client"

import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { workspaceKeys, sidebarKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { Workspace, Participant } from '@/types/entities'
import type { Database } from '@/types/database'

interface WorkspaceWithParticipant extends Workspace {
  participant?: Participant
}

type Project = Database['public']['Tables']['projects']['Row']

interface UseSidebarDataOptions {
  workspaceId?: string
}

export function useSidebarData({ workspaceId }: UseSidebarDataOptions) {
  const { user } = useAuth()
  const permissionsResult = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  const queryClient = useQueryClient()

  const [searchQuery, setSearchQuery] = useState('')

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

      // Ограниченный доступ: только проекты, где пользователь — участник
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
    projects,
    loadingWorkspaces,
    loadingProjects,
    searchQuery,
    setSearchQuery,
    currentWorkspace,
    permissionsResult,
    refreshProjects,
  }
}
