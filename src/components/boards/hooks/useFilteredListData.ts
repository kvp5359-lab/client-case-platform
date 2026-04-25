"use client"

import { useMemo } from 'react'
import { applyFilters } from '../filters/filterEngine'
import type { FilterGroup, FilterContext, SortField, SortDir } from '../types'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'

function compareTasks(a: WorkspaceTask, b: WorkspaceTask, sortBy: SortField, sortDir: SortDir): number {
  let cmp = 0
  switch (sortBy) {
    case 'manual_order':
      // Ручная сортировка всегда по возрастанию sort_order, direction игнорируется
      return (a.sort_order ?? 0) - (b.sort_order ?? 0)
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
) {
  return useMemo(() => {
    const fieldAccessors: Record<string, (item: unknown) => unknown> = {
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

    const junctionAccessors: Record<string, (id: string) => string[]> = {
      assignees: (id) =>
        (assigneesMap[id] ?? []).map((a) => a.id),
    }

    const filtered = applyFilters(tasks, filters, ctx, fieldAccessors, junctionAccessors)
    return [...filtered].sort((a, b) => compareTasks(a, b, sortBy, sortDir))
  }, [tasks, filters, ctx, assigneesMap, sortBy, sortDir])
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
) {
  return useMemo(() => {
    const fieldAccessors: Record<string, (item: unknown) => unknown> = {
      status_id: (item) => (item as T).status_id,
      deadline: (item) => (item as T).deadline,
      created_by: (item) => (item as T).created_by,
      created_at: (item) => (item as T).created_at,
      updated_at: (item) => (item as T).updated_at,
      has_active_deadline_task: (item) => (item as T).has_active_deadline_task,
    }

    const junctionAccessors: Record<string, (id: string) => string[]> = {
      participants: (id) =>
        (participantsMap[id] ?? []).map((p) => p.id),
    }

    const filtered = applyFilters(projects, filters, ctx, fieldAccessors, junctionAccessors)

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
  }, [projects, filters, ctx, participantsMap, sortBy, sortDir, nextTaskDeadlineByProjectId])
}
