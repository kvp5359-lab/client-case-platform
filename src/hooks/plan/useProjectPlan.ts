"use client"

/**
 * Хук модуля «План»: чтение блоков плана проекта + мутации (добавить,
 * изменить, удалить, переупорядочить).
 *
 * Блоки хранятся в project_plan_blocks. Задачи и слоты подтягиваются
 * по ссылке — обогащение живыми данными делается на уровне компонента
 * (PlanSection) через уже загруженные useProjectThreads / useFolderSlots,
 * чтобы не плодить дублирующие запросы.
 *
 * См. docs/feature-backlog/2026-05-30-plan-module.md
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { planDb } from './planDb'
import { planKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { PlanBlockRow, PlanBlockType, PlanBlockUpdate } from '@/types/plan'

const TABLE = 'project_plan_blocks'

export function useProjectPlan(projectId: string | undefined, workspaceId: string | undefined) {
  const queryClient = useQueryClient()

  const blocksQuery = useQuery({
    queryKey: planKeys.byProject(projectId ?? ''),
    enabled: !!projectId,
    staleTime: STALE_TIME.MEDIUM,
    queryFn: async (): Promise<PlanBlockRow[]> => {
      const { data, error } = await planDb
        .from(TABLE)
        .select('*')
        .eq('project_id', projectId as string)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as PlanBlockRow[]
    },
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: planKeys.byProject(projectId ?? '') })

  const nextSortOrder = (): number => {
    const blocks = blocksQuery.data ?? []
    return blocks.length ? Math.max(...blocks.map((b) => b.sort_order)) + 1 : 0
  }

  // ── Добавление блоков ────────────────────────────────────
  const addBlock = useMutation({
    mutationFn: async (input: {
      block_type: PlanBlockType
      content?: string | null
      thread_id?: string | null
      folder_slot_id?: string | null
    }) => {
      if (!projectId || !workspaceId) throw new Error('projectId/workspaceId required')
      const { error } = await planDb.from(TABLE).insert({
        workspace_id: workspaceId,
        project_id: projectId,
        block_type: input.block_type,
        sort_order: nextSortOrder(),
        content: input.content ?? null,
        thread_id: input.thread_id ?? null,
        folder_slot_id: input.folder_slot_id ?? null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // ── Пакетное добавление (множественный выбор в пикере) ──
  const addBlocksBatch = useMutation({
    mutationFn: async (
      inputs: Array<{ block_type: PlanBlockType; thread_id?: string; folder_slot_id?: string }>,
    ) => {
      if (!projectId || !workspaceId) throw new Error('projectId/workspaceId required')
      if (inputs.length === 0) return
      const base = nextSortOrder()
      const rows = inputs.map((inp, i) => ({
        workspace_id: workspaceId,
        project_id: projectId,
        block_type: inp.block_type,
        sort_order: base + i,
        content: null,
        thread_id: inp.thread_id ?? null,
        folder_slot_id: inp.folder_slot_id ?? null,
      }))
      const { error } = await planDb.from(TABLE).insert(rows)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // ── Изменение блока (контент текста / видимость) ─────────
  const updateBlock = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: PlanBlockUpdate }) => {
      const { error } = await planDb.from(TABLE).update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // ── Удаление блока ───────────────────────────────────────
  const deleteBlock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await planDb.from(TABLE).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // ── Переупорядочивание (после drag-n-drop) ───────────────
  // Принимает массив id в новом порядке, присваивает sort_order = индекс.
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

  return {
    blocks: blocksQuery.data ?? [],
    isLoading: blocksQuery.isLoading,
    addTextBlock: (content: string) => addBlock.mutateAsync({ block_type: 'text', content }),
    addTaskBlocks: (threadIds: string[]) =>
      addBlocksBatch.mutateAsync(threadIds.map((id) => ({ block_type: 'task', thread_id: id }))),
    addSlotBlocks: (slotIds: string[]) =>
      addBlocksBatch.mutateAsync(slotIds.map((id) => ({ block_type: 'slot', folder_slot_id: id }))),
    updateBlock: (id: string, updates: PlanBlockUpdate) =>
      updateBlock.mutateAsync({ id, updates }),
    deleteBlock: (id: string) => deleteBlock.mutateAsync(id),
    reorderBlocks: (orderedIds: string[]) => reorderBlocks.mutateAsync(orderedIds),
    isMutating:
      addBlock.isPending ||
      addBlocksBatch.isPending ||
      updateBlock.isPending ||
      deleteBlock.isPending ||
      reorderBlocks.isPending,
  }
}
