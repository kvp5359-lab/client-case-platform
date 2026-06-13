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

const TABLE = 'project_plan_blocks' as const

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
      /** Явный порядок — для общего со списком задач пространства sort_order. */
      sort_order?: number
    }) => {
      if (!projectId || !workspaceId) throw new Error('projectId/workspaceId required')
      const { error } = await planDb.from(TABLE).insert({
        workspace_id: workspaceId,
        project_id: projectId,
        block_type: input.block_type,
        sort_order: input.sort_order ?? nextSortOrder(),
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
    mutationFn: async ({
      items,
      base,
    }: {
      items: Array<{ block_type: PlanBlockType; thread_id?: string; folder_slot_id?: string }>
      /** Базовый sort_order — для общего со списком задач пространства. */
      base?: number
    }) => {
      if (!projectId || !workspaceId) throw new Error('projectId/workspaceId required')
      if (items.length === 0) return
      const start = base ?? nextSortOrder()
      const rows = items.map((inp, i) => ({
        workspace_id: workspaceId,
        project_id: projectId,
        block_type: inp.block_type,
        sort_order: start + i * 10,
        content: null,
        thread_id: inp.thread_id ?? null,
        folder_slot_id: inp.folder_slot_id ?? null,
      }))
      const { error } = await planDb.from(TABLE).insert(rows)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // ── Переупорядочивание по АБСОЛЮТНЫМ sort_order ──────────
  // Для общего со списком задач порядка: компонент считает merged-порядок и
  // пишет точные sort_order и в задачи, и в блоки.
  const setBlockOrders = useMutation({
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
    // Оптимистично и СИНХРОННО патчим порядок в кэше — патч должен лечь в том
    // же кадре, что и снятие transform у dnd-kit на отпускании, иначе блок
    // кадр стоит на старом месте (дёрганье/отскок). setQueryData ДО await,
    // cancelQueries — fire-and-forget (чтобы in-flight рефетч не перетёр).
    onMutate: (updates: { id: string; sort_order: number }[]) => {
      const key = planKeys.byProject(projectId ?? '')
      const prev = queryClient.getQueryData<PlanBlockRow[]>(key)
      const orderMap = new Map(updates.map((u) => [u.id, u.sort_order]))
      queryClient.setQueryData<PlanBlockRow[]>(key, (old) =>
        Array.isArray(old)
          ? old
              .map((b) => (orderMap.has(b.id) ? { ...b, sort_order: orderMap.get(b.id)! } : b))
              .sort((a, b) => a.sort_order - b.sort_order)
          : old,
      )
      void queryClient.cancelQueries({ queryKey: key })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      const prev = (ctx as { prev?: PlanBlockRow[] } | undefined)?.prev
      if (prev) queryClient.setQueryData(planKeys.byProject(projectId ?? ''), prev)
    },
    onSettled: invalidate,
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
    addTextBlock: (content: string, sortOrder?: number) =>
      addBlock.mutateAsync({ block_type: 'text', content, sort_order: sortOrder }),
    addHeadingBlock: (content: string, sortOrder?: number) =>
      addBlock.mutateAsync({ block_type: 'heading', content, sort_order: sortOrder }),
    addSlotBlocks: (slotIds: string[], baseSortOrder?: number) =>
      addBlocksBatch.mutateAsync({
        items: slotIds.map((id) => ({ block_type: 'slot', folder_slot_id: id })),
        base: baseSortOrder,
      }),
    updateBlock: (id: string, updates: PlanBlockUpdate) =>
      updateBlock.mutateAsync({ id, updates }),
    deleteBlock: (id: string) => deleteBlock.mutateAsync(id),
    reorderBlocks: (orderedIds: string[]) => reorderBlocks.mutateAsync(orderedIds),
    setBlockOrders: (updates: { id: string; sort_order: number }[]) =>
      setBlockOrders.mutateAsync(updates),
    isMutating:
      addBlock.isPending ||
      addBlocksBatch.isPending ||
      updateBlock.isPending ||
      deleteBlock.isPending ||
      reorderBlocks.isPending ||
      setBlockOrders.isPending,
  }
}
