"use client"

/**
 * CRUD «Групп задач» в шаблоне проекта (project_template_task_groups).
 * Блоки шаблона (project_template_plan_blocks) ссылаются на группу через group_id.
 * Доступ через `as never`-касты — таблица ещё не в database.ts.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { planKeys } from '@/hooks/queryKeys'
import type { TemplateTaskGroupRow } from '@/types/taskGroups'

const TABLE = 'project_template_task_groups'

export const templateTaskGroupKeys = {
  byTemplate: (templateId: string) => ['template-task-groups', templateId] as const,
}

export function useTemplateTaskGroups(templateId: string | undefined, workspaceId: string | undefined) {
  const qc = useQueryClient()

  const groupsQuery = useQuery({
    queryKey: templateTaskGroupKeys.byTemplate(templateId ?? ''),
    enabled: !!templateId,
    staleTime: 60_000,
    queryFn: async (): Promise<TemplateTaskGroupRow[]> => {
      const { data, error } = await supabase
        .from(TABLE as never)
        .select('*')
        .eq('project_template_id', templateId as string)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data as unknown as TemplateTaskGroupRow[]) ?? []
    },
  })

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: templateTaskGroupKeys.byTemplate(templateId ?? '') })

  const nextSortOrder = (): number => {
    const g = groupsQuery.data ?? []
    return g.length ? Math.max(...g.map((x) => x.sort_order)) + 10 : 0
  }

  const addGroup = useMutation({
    mutationFn: async (name?: string): Promise<string> => {
      if (!templateId || !workspaceId) throw new Error('templateId/workspaceId required')
      const { data, error } = await supabase
        .from(TABLE as never)
        .insert({
          workspace_id: workspaceId,
          project_template_id: templateId,
          name: name ?? 'Новая группа',
          sort_order: nextSortOrder(),
        } as never)
        .select('id')
        .single()
      if (error) throw error
      return (data as unknown as { id: string }).id
    },
    onSuccess: invalidate,
  })

  const renameGroup = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from(TABLE as never)
        .update({ name, updated_at: new Date().toISOString() } as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(TABLE as never).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: planKeys.templateByTemplate(templateId ?? '') })
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

  // Назначить/снять группу у блока шаблона.
  const assignBlock = useMutation({
    mutationFn: async ({ blockId, groupId }: { blockId: string; groupId: string | null }) => {
      const { error } = await supabase
        .from('project_template_plan_blocks' as never)
        .update({ group_id: groupId } as never)
        .eq('id' as never, blockId as never)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: planKeys.templateByTemplate(templateId ?? '') }),
  })

  return {
    groups: groupsQuery.data ?? [],
    isLoading: groupsQuery.isLoading,
    addGroup: (name?: string) => addGroup.mutateAsync(name),
    renameGroup: (id: string, name: string) => renameGroup.mutateAsync({ id, name }),
    deleteGroup: (id: string) => deleteGroup.mutateAsync(id),
    setGroupOrders: (updates: { id: string; sort_order: number }[]) => setGroupOrders.mutateAsync(updates),
    assignBlockToGroup: (blockId: string, groupId: string | null) =>
      assignBlock.mutateAsync({ blockId, groupId }),
    isMutating:
      addGroup.isPending || renameGroup.isPending || deleteGroup.isPending ||
      setGroupOrders.isPending || assignBlock.isPending,
  }
}
