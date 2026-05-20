"use client"

import { useMemo } from 'react'
import { applyFilters } from '@/lib/filters/filterEngine'
import type { FilterGroup, FilterContext, SortField, SortDir } from '@/lib/filters/types'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'

// Статичные accessors — выносим на уровень модуля, чтобы не пересоздавать их
// в useMemo при изменении сортировки/фильтров. Это были «горячие» аллокации:
// при каждом сдвиге слайдера сортировки или вводе в фильтр-форму
// пересоздавались два объекта с 10+ замыканиями.
const TASK_FIELD_ACCESSORS: Record<string, (item: unknown) => unknown> = {
  name: (item) => (item as WorkspaceTask).name,
  type: (item) => (item as WorkspaceTask).type,
  status_id: (item) => (item as WorkspaceTask).status_id,
  project_id: (item) => (item as WorkspaceTask).project_id,
  deadline: (item) => (item as WorkspaceTask).deadline,
  accent_color: (item) => (item as WorkspaceTask).accent_color,
  is_pinned: (item) => (item as WorkspaceTask).is_pinned,
  created_by: (item) => (item as WorkspaceTask).created_by,
  created_at: (item) => (item as WorkspaceTask).created_at,
  updated_at: (item) => (item as WorkspaceTask).updated_at,
}

const PROJECT_FIELD_ACCESSORS: Record<string, (item: unknown) => unknown> = {
  status_id: (item) => (item as Record<string, unknown>).status_id,
  template_id: (item) => (item as Record<string, unknown>).template_id,
  deadline: (item) => (item as Record<string, unknown>).deadline,
  created_by: (item) => (item as Record<string, unknown>).created_by,
  created_at: (item) => (item as Record<string, unknown>).created_at,
  updated_at: (item) => (item as Record<string, unknown>).updated_at,
  has_active_deadline_task: (item) => (item as Record<string, unknown>).has_active_deadline_task,
  is_lead_template: (item) => (item as Record<string, unknown>).is_lead_template,
  final_kind: (item) => (item as Record<string, unknown>).final_kind,
  contact_participant_id: (item) => (item as Record<string, unknown>).contact_participant_id,
}

function compareTasks(
  a: WorkspaceTask,
  b: WorkspaceTask,
  sortBy: SortField,
  sortDir: SortDir,
  manualPositions?: Record<string, number>,
): number {
  let cmp = 0
  switch (sortBy) {
    case 'manual_order': {
      // Ручная сортировка по позициям из board_list_item_order для данного
      // списка. Элементы без записи уезжают в конец, между собой — по
      // created_at desc (свежие наверху, чтобы новая задача сразу была видна).
      const pa = manualPositions?.[a.id]
      const pb = manualPositions?.[b.id]
      if (pa != null && pb != null) return pa - pb
      if (pa != null) return -1
      if (pb != null) return 1
      const ca = new Date(a.created_at).getTime()
      const cb = new Date(b.created_at).getTime()
      return cb - ca
    }
    case 'name':
      cmp = (a.name ?? '').localeCompare(b.name ?? '')
      break
    case 'deadline': {
      const da = a.deadline ? new Date(a.deadline).getTime() : Infinity
      const db = b.deadline ? new Date(b.deadline).getTime() : Infinity
      cmp = da - db
      break
    }
    case 'status_order':
      cmp = (a.status_order ?? Infinity) - (b.status_order ?? Infinity)
      break
    case 'updated_at': {
      const ua = new Date(a.updated_at).getTime()
      const ub = new Date(b.updated_at).getTime()
      cmp = ua - ub
      break
    }
    case 'created_at':
    default: {
      const ca = new Date(a.created_at).getTime()
      const cb = new Date(b.created_at).getTime()
      cmp = ca - cb
      break
    }
  }
  return sortDir === 'desc' ? -cmp : cmp
}

/**
 * Фильтрует и сортирует задачи по конфигу списка.
 */
export function useFilteredTasks(
  tasks: WorkspaceTask[],
  filters: FilterGroup,
  ctx: FilterContext,
  assigneesMap: Record<string, { id: string }[]>,
  sortBy: SortField = 'created_at',
  sortDir: SortDir = 'desc',
  manualPositions?: Record<string, number>,
) {
  // Junction accessor мемоизируем по assigneesMap: кэш id → массив id
  // исполнителей. Без этого .map(a => a.id) выполнялся бы заново для
  // каждой задачи на каждом прогоне фильтра — лишние аллокации на доске
  // с сотнями задач.
  const taskJunctionAccessors = useMemo(() => {
    const cache: Record<string, string[]> = {}
    return {
      assignees: (id: string): string[] => {
        const cached = cache[id]
        if (cached) return cached
        const arr = (assigneesMap[id] ?? []).map((a) => a.id)
        cache[id] = arr
        return arr
      },
    } as Record<string, (id: string) => string[]>
  }, [assigneesMap])

  return useMemo(() => {
    const filtered = applyFilters(tasks, filters, ctx, TASK_FIELD_ACCESSORS, taskJunctionAccessors)
    return [...filtered].sort((a, b) => compareTasks(a, b, sortBy, sortDir, manualPositions))
  }, [tasks, filters, ctx, taskJunctionAccessors, sortBy, sortDir, manualPositions])
}

/**
 * Фильтрует и сортирует проекты по конфигу списка.
 *
 * Сортировка `next_task_deadline` — по дате ближайшей незавершённой задачи
 * проекта из опционального `nextTaskDeadlineByProjectId`. Проекты без задачи
 * уезжают в конец независимо от направления сортировки.
 */
export function useFilteredProjects<T extends Record<string, unknown> & { id: string }>(
  projects: T[],
  filters: FilterGroup,
  ctx: FilterContext,
  participantsMap: Record<string, { id: string }[]>,
  sortBy: SortField = 'created_at',
  sortDir: SortDir = 'desc',
  nextTaskDeadlineByProjectId: Record<string, string | null> = {},
  manualPositions?: Record<string, number>,
) {
  const projectJunctionAccessors = useMemo(() => {
    const cache: Record<string, string[]> = {}
    return {
      participants: (id: string): string[] => {
        const cached = cache[id]
        if (cached) return cached
        const arr = (participantsMap[id] ?? []).map((p) => p.id)
        cache[id] = arr
        return arr
      },
    } as Record<string, (id: string) => string[]>
  }, [participantsMap])

  return useMemo(() => {
    const filtered = applyFilters(projects, filters, ctx, PROJECT_FIELD_ACCESSORS, projectJunctionAccessors)

    if (sortBy === 'manual_order') {
      // Ручная сортировка по позициям из board_list_item_order. Элементы без
      // записи — в конец, между собой по created_at desc.
      const positions = manualPositions ?? {}
      return [...filtered].sort((a, b) => {
        const pa = positions[a.id]
        const pb = positions[b.id]
        if (pa != null && pb != null) return pa - pb
        if (pa != null) return -1
        if (pb != null) return 1
        const ca = new Date((a.created_at as string | undefined) ?? 0).getTime()
        const cb = new Date((b.created_at as string | undefined) ?? 0).getTime()
        return cb - ca
      })
    }

    const getSortKey = (p: T): string | null => {
      switch (sortBy) {
        case 'name':
          return ((p.name as string | undefined) ?? '').toLowerCase()
        case 'updated_at':
          return (p.updated_at as string | undefined) ?? null
        case 'next_task_deadline':
          return nextTaskDeadlineByProjectId[p.id] ?? null
        case 'created_at':
        default:
          return (p.created_at as string | undefined) ?? null
      }
    }

    const mult = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const ka = getSortKey(a)
      const kb = getSortKey(b)
      // null (нет значения) всегда в конце, независимо от direction
      if (ka == null && kb == null) return 0
      if (ka == null) return 1
      if (kb == null) return -1
      if (ka < kb) return -1 * mult
      if (ka > kb) return 1 * mult
      return 0
    })
  }, [projects, filters, ctx, projectJunctionAccessors, sortBy, sortDir, nextTaskDeadlineByProjectId, manualPositions])
}
