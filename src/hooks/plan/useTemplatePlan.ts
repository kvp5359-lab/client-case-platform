"use client"

/**
 * Хук «рыбы» плана в шаблоне проекта (project_template_plan_blocks).
 *
 * Фаза 3: поддерживаются блоки text + task (ссылка на thread_template).
 * Slot-блоки в шаблоне отложены — резолв слота при разворачивании
 * неоднозначен (folder_slots ссылается на folder_template_slots, а наборы
 * документов используют document_kit_template_folder_slots). Слоты в живом
 * плане проекта (useProjectPlan) при этом работают.
 *
 * См. docs/feature-backlog/2026-05-30-plan-module.md
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { planDb } from './planDb'
import { planKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { TemplatePlanBlockRow, PlanBlockType, PlanBlockUpdate } from '@/types/plan'

const TABLE = 'project_template_plan_blocks' as const

export function useTemplatePlan(
  templateId: string | undefined,
  workspaceId: string | undefined,
) {
  const queryClient = useQueryClient()

  const blocksQuery = useQuery({
    queryKey: planKeys.templateByTemplate(templateId ?? ''),
    enabled: !!templateId,
    staleTime: STALE_TIME.MEDIUM,
    queryFn: async (): Promise<TemplatePlanBlockRow[]> => {
      const { data, error } = await planDb
        .from(TABLE)
        .select('*')
        .eq('project_template_id', templateId as string)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as TemplatePlanBlockRow[]
    },
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: planKeys.templateByTemplate(templateId ?? '') })

  const nextSortOrder = (): number => {
    const blocks = blocksQuery.data ?? []
    return blocks.length ? Math.max(...blocks.map((b) => b.sort_order)) + 1 : 0
  }

  const addBlock = useMutation({
    mutationFn: async (input: {
      block_type: PlanBlockType
      content?: string | null
      thread_template_id?: string | null
      sort_order?: number
    }) => {
      if (!templateId || !workspaceId) throw new Error('templateId/workspaceId required')
      const { error } = await planDb.from(TABLE).insert({
        workspace_id: workspaceId,
        project_template_id: templateId,
        block_type: input.block_type,
        sort_order: input.sort_order ?? nextSortOrder(),
        content: input.content ?? null,
        thread_template_id: input.thread_template_id ?? null,
        slot_template_id: null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // Пакетное добавление задач (множественный выбор в пикере).
  const addTaskBlocksBatch = useMutation({
    mutationFn: async (threadTemplateIds: string[]) => {
      if (!templateId || !workspaceId) throw new Error('templateId/workspaceId required')
      if (threadTemplateIds.length === 0) return
      const base = nextSortOrder()
      const rows = threadTemplateIds.map((tplId, i) => ({
        workspace_id: workspaceId,
        project_template_id: templateId,
        block_type: 'task',
        sort_order: base + i,
        content: null,
        thread_template_id: tplId,
        slot_template_id: null,
      }))
      const { error } = await planDb.from(TABLE).insert(rows)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updateBlock = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: PlanBlockUpdate }) => {
      const { error } = await planDb.from(TABLE).update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteBlock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await planDb.from(TABLE).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const reorderBlocks = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, index) =>
          planDb
            .from(TABLE)
            .update({ sort_order: index })
            .eq('id', id)
            .then(({ error }: { error: unknown }) => {
              if (error) throw error
            }),
        ),
      )
    },
    onSuccess: invalidate,
  })

  // Явная установка sort_order по id — для единого порядка задач+блоков
  // в секции «Задачи» (там нумерация считается снаружи по общему списку).
  const setBlockOrdersMut = useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      await Promise.all(
        updates.map((u) =>
          planDb
            .from(TABLE)
            .update({ sort_order: u.sort_order })
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
    blocks: blocksQuery.data ?? [],
    isLoading: blocksQuery.isLoading,
    addTextBlock: (content: string, sortOrder?: number) =>
      addBlock.mutateAsync({ block_type: 'text', content, sort_order: sortOrder }),
    addHeadingBlock: (content: string, sortOrder?: number) =>
      addBlock.mutateAsync({ block_type: 'heading', content, sort_order: sortOrder }),
    addTaskBlocks: (threadTemplateIds: string[]) =>
      addTaskBlocksBatch.mutateAsync(threadTemplateIds),
    updateBlock: (id: string, updates: PlanBlockUpdate) =>
      updateBlock.mutateAsync({ id, updates }),
    deleteBlock: (id: string) => deleteBlock.mutateAsync(id),
    reorderBlocks: (orderedIds: string[]) => reorderBlocks.mutateAsync(orderedIds),
    setBlockOrders: (updates: { id: string; sort_order: number }[]) =>
      setBlockOrdersMut.mutateAsync(updates),
  }
}
