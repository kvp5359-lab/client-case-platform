"use client"

/**
 * CRUD «Групп задач» проекта (project_task_groups).
 *
 * Группа = раздел плана. Задачи/блоки ссылаются на неё через
 * project_threads.task_group_id / project_plan_blocks.group_id.
 * Доступ через `as never`-касты — таблица ещё не в database.ts (как usage-хуки).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TaskGroupRow, TaskGroupUpdate } from '@/types/taskGroups'

const TABLE = 'project_task_groups'

export const taskGroupKeys = {
  byProject: (projectId: string) => ['task-groups', projectId] as const,
}

export function useProjectTaskGroups(projectId: string | undefined, workspaceId: string | undefined) {
  const qc = useQueryClient()

  const groupsQuery = useQuery({
    queryKey: taskGroupKeys.byProject(projectId ?? ''),
    enabled: !!projectId,
    staleTime: 60_000,
    queryFn: async (): Promise<TaskGroupRow[]> => {
      const { data, error } = await supabase
        .from(TABLE as never)
        .select('*')
        .eq('project_id', projectId as string)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data as unknown as TaskGroupRow[]) ?? []
    },
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: taskGroupKeys.byProject(projectId ?? '') })

  const nextSortOrder = (): number => {
    const g = groupsQuery.data ?? []
    return g.length ? Math.max(...g.map((x) => x.sort_order)) + 10 : 0
  }

  const addGroup = useMutation({
    mutationFn: async (input: { name?: string; sort_order?: number; accent_color?: string | null }): Promise<string> => {
      if (!projectId || !workspaceId) throw new Error('projectId/workspaceId required')
      const { data, error } = await supabase
        .from(TABLE as never)
        .insert({
          workspace_id: workspaceId,
          project_id: projectId,
          name: input.name ?? 'Новая группа',
          accent_color: input.accent_color ?? null,
          sort_order: input.sort_order ?? nextSortOrder(),
        } as never)
        .select('id')
        .single()
      if (error) throw error
      return (data as unknown as { id: string }).id
    },
    onSuccess: invalidate,
  })

  const updateGroup = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TaskGroupUpdate }) => {
      const { error } = await supabase
        .from(TABLE as never)
        .update({ ...updates, updated_at: new Date().toISOString() } as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteGroup = useMutation({
    // Удаление группы: ON DELETE SET NULL у задач/блоков → они всплывают на
    // верхний уровень (не теряются). Порядок сохраняют свой sort_order.
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(TABLE as never).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      // Задачи/блоки могли изменить group_id → освежаем план и треды.
      qc.invalidateQueries({ queryKey: ['plan'] })
      qc.invalidateQueries({ queryKey: ['project-threads'] })
    },
  })

  const setGroupOrders = useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      await Promise.all(
        updates.map((u) =>
          supabase
            .from(TABLE as never)
            .update({ sort_order: u.sort_order } as never)
            .eq('id', u.id)
            .then(({ error }: { error: unknown }) => {
              if (error) throw error
            }),
        ),
      )
    },
    onSuccess: invalidate,
  })

  return {
    groups: groupsQuery.data ?? [],
    isLoading: groupsQuery.isLoading,
    addGroup: (name?: string, sortOrder?: number) => addGroup.mutateAsync({ name, sort_order: sortOrder }),
    renameGroup: (id: string, name: string) => updateGroup.mutateAsync({ id, updates: { name } }),
    setGroupColor: (id: string, accent_color: string | null) => updateGroup.mutateAsync({ id, updates: { accent_color } }),
    setGroupCollapsed: (id: string, is_collapsed: boolean) => updateGroup.mutateAsync({ id, updates: { is_collapsed } }),
    setGroupVisibleToClient: (id: string, visible_to_client: boolean) =>
      updateGroup.mutateAsync({ id, updates: { visible_to_client } }),
    deleteGroup: (id: string) => deleteGroup.mutateAsync(id),
    setGroupOrders: (updates: { id: string; sort_order: number }[]) => setGroupOrders.mutateAsync(updates),
    isMutating: addGroup.isPending || updateGroup.isPending || deleteGroup.isPending || setGroupOrders.isPending,
  }
}
