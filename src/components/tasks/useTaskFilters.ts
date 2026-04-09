"use client"

/**
 * Хук фильтрации задач для TaskListView.
 * Инкапсулирует: пресеты, effectiveAssigneeFilter, effectiveStatusFilter,
 * projectOptions, filteredTasks, grouping (grouped + completedTasks).
 */

import { useState, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getDeadlineGroup } from '@/utils/deadlineUtils'
import type { TaskStatus } from '@/hooks/useStatuses'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { DeadlineFilterValue } from './filters'
import type { TaskItem } from './types'
import { groupTasks } from './taskListConstants'

export type TaskPreset = 'my_active' | 'active' | 'all' | 'control'

interface UseTaskFiltersParams {
  allTasks: TaskItem[]
  membersMap: Record<string, AvatarParticipant[]>
  taskStatuses: TaskStatus[]
  currentParticipantId: string | null
  isProjectMode: boolean
}

export function useTaskFilters({
  allTasks,
  membersMap,
  taskStatuses,
  currentParticipantId,
  isProjectMode,
}: UseTaskFiltersParams) {
  const { user } = useAuth()

  const [preset, setPreset] = useState<TaskPreset>(isProjectMode ? 'all' : 'my_active')
  const [filtersModified, setFiltersModified] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [assigneeFilterIds, setAssigneeFilterIds] = useState<Set<string> | null>(null)
  const [deadlineFilter, setDeadlineFilter] = useState<Set<DeadlineFilterValue>>(new Set())
  const [projectFilterIds, setProjectFilterIds] = useState<Set<string>>(new Set())
  const [statusFilterIds, setStatusFilterIds] = useState<Set<string> | null>(null)
  const [groupByDeadline, setGroupByDeadline] = useState(false)

  // Применить пресет: сбрасывает все ручные фильтры
  const applyPreset = (p: TaskPreset) => {
    setPreset(p)
    setFiltersModified(false)
    setAssigneeFilterIds(null)
    setStatusFilterIds(null)
    setDeadlineFilter(new Set())
    setProjectFilterIds(new Set())
    setSearchQuery('')
  }

  // Пометить фильтры как изменённые вручную
  const markModified = () => {
    if (!filtersModified) setFiltersModified(true)
  }

  // ── Вычисляемые фильтры ──

  const effectiveAssigneeFilter = useMemo(() => {
    if (assigneeFilterIds !== null) return assigneeFilterIds
    if (preset === 'all' || preset === 'active') return new Set<string>()
    if (!currentParticipantId) return new Set<string>()
    if (preset === 'control') {
      const others = new Set<string>()
      for (const members of Object.values(membersMap)) {
        for (const m of members) {
          if (m.id !== currentParticipantId) others.add(m.id)
        }
      }
      return others
    }
    // my_active — фильтр по текущему пользователю
    return new Set([currentParticipantId])
  }, [assigneeFilterIds, currentParticipantId, preset, membersMap])

  const effectiveStatusFilter = useMemo(() => {
    if (statusFilterIds !== null) return statusFilterIds
    if (preset === 'all') return new Set<string>()
    // active, control — нефинальные + без статуса
    // my_active — нефинальные + без статуса + show_to_creator (для задач где я постановщик)
    if (taskStatuses.length > 0) {
      const nonFinal = taskStatuses.filter((s) => !s.is_final).map((s) => s.id)
      const ids = [...nonFinal, '__no_status__']
      if (preset === 'my_active') {
        const showToCreator = taskStatuses.filter((s) => s.show_to_creator).map((s) => s.id)
        ids.push(...showToCreator)
      }
      return new Set(ids)
    }
    return new Set<string>()
  }, [statusFilterIds, taskStatuses, preset])

  const projectOptions = useMemo(() => {
    if (isProjectMode) return []
    const map = new Map<string, string>()
    for (const t of allTasks) {
      if (t.project_id && t.project_name && !map.has(t.project_id)) {
        map.set(t.project_id, t.project_name)
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [allTasks, isProjectMode])

  const filteredTasks = useMemo(() => {
    let result = allTasks

    // Скрываем задачи со статусом «показывать постановщику» у исполнителя (кроме пресетов «Все» и «Активные»)
    if (preset !== 'all' && preset !== 'active' && user?.id) {
      result = result.filter((t) => {
        if (!t.status_show_to_creator) return true
        return t.created_by === user.id
      })
    }

    // Фильтр по исполнителям
    if (effectiveAssigneeFilter.size > 0) {
      result = result.filter((t) => {
        const taskMembers = membersMap[t.id] ?? []
        if (taskMembers.some((m) => effectiveAssigneeFilter.has(m.id))) return true
        // my_active: показывать задачи со статусом «показывать постановщику», где я — постановщик
        if (preset === 'my_active' && t.status_show_to_creator && t.created_by === user?.id)
          return true
        return false
      })
    }

    // Фильтр по сроку
    if (deadlineFilter.size > 0) {
      result = result.filter((t) => {
        const group = getDeadlineGroup(t.deadline)
        return deadlineFilter.has(group as DeadlineFilterValue)
      })
    }

    // Фильтр по статусам
    if (effectiveStatusFilter.size > 0) {
      result = result.filter((t) => {
        if (!t.status_id) return effectiveStatusFilter.has('__no_status__')
        return effectiveStatusFilter.has(t.status_id)
      })
    }

    // Фильтр по проектам (только в workspace-режиме)
    if (!isProjectMode && projectFilterIds.size > 0) {
      result = result.filter((t) => t.project_id && projectFilterIds.has(t.project_id))
    }

    // Поиск
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (t) => t.name.toLowerCase().includes(q) || (t.project_name ?? '').toLowerCase().includes(q),
      )
    }

    return result
  }, [
    allTasks,
    searchQuery,
    effectiveAssigneeFilter,
    deadlineFilter,
    effectiveStatusFilter,
    projectFilterIds,
    membersMap,
    user,
    isProjectMode,
    preset,
  ])

  // Набор id «закрытых» статусов: финальные + НЕ показываются постановщику
  const closedStatusIds = useMemo(
    () => new Set(taskStatuses.filter((s) => s.is_final && !s.show_to_creator).map((s) => s.id)),
    [taskStatuses],
  )

  const { grouped, completedTasks } = useMemo(() => {
    const active: TaskItem[] = []
    const completed: TaskItem[] = []
    for (const t of filteredTasks) {
      if (t.status_id && closedStatusIds.has(t.status_id)) {
        completed.push(t)
      } else {
        active.push(t)
      }
    }

    let groups: Map<string, TaskItem[]>
    if (groupByDeadline) {
      groups = groupTasks(active)
      for (const items of groups.values()) {
        items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      }
    } else {
      // Flat list — all tasks together (including completed), sorted by sort_order
      const sorted = [...filteredTasks].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      groups = new Map([['all', sorted]])
      return { grouped: groups, completedTasks: [] }
    }
    return { grouped: groups, completedTasks: completed }
  }, [filteredTasks, closedStatusIds, groupByDeadline])

  return {
    // State
    preset,
    filtersModified,
    searchQuery,
    setSearchQuery,
    assigneeFilterIds,
    setAssigneeFilterIds,
    deadlineFilter,
    setDeadlineFilter,
    projectFilterIds,
    setProjectFilterIds,
    statusFilterIds,
    setStatusFilterIds,
    // Actions
    applyPreset,
    markModified,
    // Computed
    effectiveAssigneeFilter,
    effectiveStatusFilter,
    projectOptions,
    filteredTasks,
    grouped,
    completedTasks,
    groupByDeadline,
    setGroupByDeadline,
  }
}
