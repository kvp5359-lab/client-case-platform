"use client"

/**
 * useAccessibleProjects — загрузка проектов workspace с фильтрацией по правам доступа.
 * Возвращает только проекты, к которым у пользователя есть доступ
 * (участник проекта ИЛИ view_all_projects).
 *
 * Замена для useWorkspaceProjects (который загружал все проекты без проверки).
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { accessibleProjectKeys } from '@/hooks/queryKeys'
import type { BoardProject } from '@/components/boards/hooks/useWorkspaceProjects'

export function useAccessibleProjects(workspaceId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: accessibleProjectKeys.forUser(workspaceId ?? '', user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_accessible_projects' as never, {
        p_workspace_id: workspaceId!,
        p_user_id: user!.id,
      } as never)
      if (error) throw error
      return (data ?? []) as BoardProject[]
    },
    enabled: !!workspaceId && !!user?.id,
    staleTime: 2 * 60 * 1000,
  })
}
