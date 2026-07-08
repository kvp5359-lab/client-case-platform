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
import { planKeys, workspaceThreadKeys } from '@/hooks/queryKeys'
import type { TaskGroupRow, TaskGroupUpdate } from '@/types/taskGroups'

const TABLE = 'project_task_groups'

export const taskGroupKeys = {
  byProject: (projectId: string) => ['task-groups', projectId] as const,
  membership: (projectId: string) => ['task-group-membership', projectId] as const,
}

/**
 * Карта «задача → группа» по проекту, лёгким запросом (id, task_group_id).
 * Так не трогаем тяжёлый RPC get_workspace_threads (и его потребителя
 * get_board_filtered_threads) — по образцу дозапроса дат в календаре.
 */
export function useProjectThreadGroupMap(projectId: string | undefined) {
  return useQuery({
    queryKey: taskGroupKeys.membership(projectId ?? ''),
    enabled: !!projectId,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, string | null>> => {
      const { data, error } = await supabase
        .from('project_threads' as never)
        .select('id, task_group_id')
        .eq('project_id' as never, projectId as never)
        .eq('is_deleted' as never, false as never)
      if (error) throw error
      const map: Record<string, string | null> = {}
      for (const r of (data as unknown as { id: string; task_group_id: string | null }[]) ?? []) {
        map[r.id] = r.task_group_id ?? null
      }
      return map
    },
  })
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
    // Оптимистично патчим группу в кэше сразу — иначе сворачивание/переименование/
    // смена цвета ждут круга до БД (задержка ~1с). onSettled рефетчит фоном.
    onMutate: async ({ id, updates }: { id: string; updates: TaskGroupUpdate }) => {
      const key = taskGroupKeys.byProject(projectId ?? '')
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<TaskGroupRow[]>(key)
      qc.setQueryData<TaskGroupRow[]>(key, (old) =>
        Array.isArray(old) ? old.map((g) => (g.id === id ? { ...g, ...updates } : g)) : old,
      )
      return { prev }
    },
    onError: (_e, _v, ctx: { prev?: TaskGroupRow[] } | undefined) => {
      if (ctx?.prev) qc.setQueryData(taskGroupKeys.byProject(projectId ?? ''), ctx.prev)
    },
    onSettled: invalidate,
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
      // ON DELETE SET NULL сменил group_id у задач/блоков → освежаем карту
      // «задача→группа» (иначе задачи удалённой группы исчезают из вида до
      // истечения staleTime), план и кэши тредов.
      qc.invalidateQueries({ queryKey: taskGroupKeys.membership(projectId ?? '') })
      qc.invalidateQueries({ queryKey: planKeys.byProject(projectId ?? '') })
      qc.invalidateQueries({ queryKey: workspaceThreadKeys.all })
    },
  })

  // Назначить/снять группу у задачи (task_group_id) или блока плана (group_id).
  const assignThread = useMutation({
    mutationFn: async ({ threadId, groupId }: { threadId: string; groupId: string | null }) => {
      const { error } = await supabase
        .from('project_threads' as never)
        .update({ task_group_id: groupId } as never)
        .eq('id' as never, threadId as never)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: taskGroupKeys.membership(projectId ?? '') }),
  })
  const assignBlock = useMutation({
    mutationFn: async ({ blockId, groupId }: { blockId: string; groupId: string | null }) => {
      const { error } = await supabase
        .from('project_plan_blocks' as never)
        .update({ group_id: groupId } as never)
        .eq('id' as never, blockId as never)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan'] }),
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
    assignThreadToGroup: (threadId: string, groupId: string | null) =>
      assignThread.mutateAsync({ threadId, groupId }),
    assignBlockToGroup: (blockId: string, groupId: string | null) =>
      assignBlock.mutateAsync({ blockId, groupId }),
    isMutating:
      addGroup.isPending || updateGroup.isPending || deleteGroup.isPending ||
      setGroupOrders.isPending || assignThread.isPending || assignBlock.isPending,
  }
}
