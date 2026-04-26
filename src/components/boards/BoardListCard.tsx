"use client"

import { useCallback, useMemo, useState } from 'react'
import {
  DndContext,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { useDialog } from '@/hooks/shared/useDialog'
import { useFilteredTasks, useFilteredProjects } from './hooks/useFilteredListData'
import { useWorkspaceProjectParticipants } from './hooks/useWorkspaceProjectParticipants'
import { BoardTaskRow } from './BoardTaskRow'
import { DraggableBoardTaskRow } from './DraggableBoardTaskRow'
import { BoardProjectRow } from './BoardProjectRow'
import { BoardInboxList } from './BoardInboxList'
import { BoardListHeader } from './BoardListHeader'
import { ListSettingsDialog } from './ListSettingsDialog'
import type { BoardList, FilterContext, GroupByField } from './types'
import { groupTasks, groupProjects } from './boardListUtils'
import { useAllProjectStatuses } from '@/hooks/useStatuses'
import { useReorderTasks } from '@/components/tasks/useTaskMutations'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { workspaceThreadKeys } from '@/hooks/queryKeys'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { StatusOption } from '@/components/ui/status-dropdown'
import type { BoardProject } from './hooks/useWorkspaceProjects'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { TaskItem } from '@/components/tasks/types'

interface BoardListCardProps {
  list: BoardList
  tasks: WorkspaceTask[]
  projects: BoardProject[]
  inboxThreads: InboxThreadEntry[]
  assigneesMap: Record<string, AvatarParticipant[]>
  filterCtx: FilterContext
  workspaceId: string
  statuses: StatusOption[]
  onOpenTask: (taskId: string) => void
  onOpenThread: (task: TaskItem) => void
  onStatusChange: (taskId: string, statusId: string | null) => void
  selectedThreadId?: string | null
  selectedProjectId?: string | null
  existingColumns?: number
  isFirst?: boolean
  isLast?: boolean
  siblingLists?: BoardList[]
  columnWidth?: number
}

export function BoardListCard({
  list,
  tasks,
  projects,
  inboxThreads,
  assigneesMap,
  filterCtx,
  workspaceId,
  statuses,
  onOpenTask,
  onOpenThread,
  onStatusChange,
  selectedThreadId,
  selectedProjectId,
  existingColumns,
  isFirst,
  isLast,
  siblingLists,
  columnWidth,
}: BoardListCardProps) {
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null)
  const settingsDialog = useDialog()

  const simpleAssigneesMap = useMemo(() => {
    const result: Record<string, { id: string }[]> = {}
    for (const [key, val] of Object.entries(assigneesMap)) {
      result[key] = val.map((a) => ({ id: a.id }))
    }
    return result
  }, [assigneesMap])

  const isProject = list.entity_type === 'project'
  const isInbox = list.entity_type === 'inbox'
  const safeFilters = isInbox ? { logic: 'and' as const, rules: [] } : list.filters
  const hasFilters = safeFilters.rules.length > 0

  // Для списков проектов вычисляем карту «ближайшая незавершённая задача» по project_id.
  // Используем уже загруженный кэш `tasks` (useWorkspaceThreads) — дополнительных запросов нет.
  // Загружаем is_final из taskStatuses только если это project-list, чтобы не дёргать в task-списках.
  const { data: fullStatuses = [] } = useTaskStatuses(isProject ? workspaceId : undefined)
  const nextTaskByProjectId = useMemo(() => {
    if (!isProject) return {}
    const finalStatusIds = new Set(fullStatuses.filter((s) => s.is_final).map((s) => s.id))
    const byProject: Record<string, WorkspaceTask> = {}
    for (const t of tasks) {
      if (t.type !== 'task') continue
      if (!t.project_id || !t.deadline) continue
      if (t.status_id && finalStatusIds.has(t.status_id)) continue
      const existing = byProject[t.project_id]
      if (!existing || new Date(t.deadline).getTime() < new Date(existing.deadline!).getTime()) {
        byProject[t.project_id] = t
      }
    }
    return byProject
  }, [isProject, tasks, fullStatuses])

  // Карта project_id → deadline ближайшей задачи (для сортировки в useFilteredProjects).
  const nextTaskDeadlineByProjectId = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const [pid, t] of Object.entries(nextTaskByProjectId)) {
      map[pid] = t.deadline
    }
    return map
  }, [nextTaskByProjectId])

  // Карта user_id (created_by) → имя участника для поля «Автор» в project-листах.
  // Участники воркспейса уже кэшируются на уровне WorkspaceLayout, так что
  // дополнительного запроса не будет — заглядываем в тот же кэш.
  const { data: participants = [] } = useWorkspaceParticipants(isProject ? workspaceId : undefined)
  const authorNameByUserId = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of participants) {
      if (!p.user_id) continue
      map[p.user_id] = p.last_name ? `${p.name} ${p.last_name}` : p.name
    }
    return map
  }, [participants])

  const filteredTasks = useFilteredTasks(
    list.entity_type === 'task' ? tasks : [],
    safeFilters,
    filterCtx,
    simpleAssigneesMap,
    list.sort_by ?? 'created_at',
    list.sort_dir ?? 'desc',
  )

  const { data: projectParticipantsMap } = useWorkspaceProjectParticipants(
    workspaceId,
    isProject,
  )

  const filteredProjects = useFilteredProjects(
    isProject ? projects : [],
    safeFilters,
    filterCtx,
    projectParticipantsMap ?? {},
    list.sort_by ?? 'created_at',
    list.sort_dir ?? 'desc',
    nextTaskDeadlineByProjectId,
  )

  const count = isInbox ? inboxThreads.length : isProject ? filteredProjects.length : filteredTasks.length
  const collapsed = userCollapsed ?? (!isInbox && count === 0)

  const isCards = (list.display_mode ?? 'list') === 'cards'
  const groupByField = (list.group_by ?? 'none') as GroupByField
  const listHeight = list.list_height ?? 'auto'

  const heightClass =
    listHeight === 'full' ? 'flex-1 min-h-0' :
    listHeight === 'medium' ? 'max-h-[600px]' :
    'max-h-[400px]'

  const groups = useMemo(
    () => groupTasks(filteredTasks, groupByField, assigneesMap, statuses),
    [filteredTasks, groupByField, assigneesMap, statuses],
  )

  // Project-статусы воркспейса нужны только для группировки списка проектов
  // по статусу. Запрашиваются всегда — кэш единый и переиспользуется
  // ProjectStatusFilter, BoardProjectRow и другими.
  const { data: projectStatuses = [] } = useAllProjectStatuses(isProject ? workspaceId : undefined)
  const projectGroups = useMemo(
    () => groupProjects(filteredProjects, groupByField, projectStatuses),
    [filteredProjects, groupByField, projectStatuses],
  )
  const hasGrouping = groupByField !== 'none'
  const isManualSort = list.sort_by === 'manual_order' && !hasGrouping && !isProject && !isInbox

  const invalidateKeys = useMemo(
    () => [workspaceThreadKeys.workspace(workspaceId)],
    [workspaceId],
  )
  const reorderTasks = useReorderTasks(invalidateKeys)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )
  const [activeTask, setActiveTask] = useState<WorkspaceTask | null>(null)
  const [dropIndicator, setDropIndicator] = useState<{ taskId: string; position: 'top' | 'bottom' } | null>(null)

  const handleDragStart = useCallback((e: DragStartEvent) => {
    const task = e.active.data.current?.task as WorkspaceTask | undefined
    setActiveTask(task ?? null)
  }, [])

  const handleDragOver = useCallback((e: DragOverEvent) => {
    const { over, active } = e
    if (!over || !active || String(over.id) === String(active.id)) {
      setDropIndicator(null)
      return
    }
    const rect = over.rect
    if (!rect) return
    const pointerY = (e.activatorEvent as PointerEvent)?.clientY ?? 0
    const currentY = pointerY + (e.delta?.y ?? 0)
    const midY = rect.top + rect.height / 2
    setDropIndicator({ taskId: String(over.id), position: currentY < midY ? 'top' : 'bottom' })
  }, [])

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    const ind = dropIndicator
    setActiveTask(null)
    setDropIndicator(null)
    if (!e.over || !ind) return
    const activeId = String(e.active.id)
    const overId = String(e.over.id)
    if (activeId === overId) return

    const current = filteredTasks
    const dragged = current.find((t) => t.id === activeId)
    if (!dragged) return
    const filtered = current.filter((t) => t.id !== activeId)
    const overIdx = filtered.findIndex((t) => t.id === overId)
    if (overIdx === -1) return
    const insertIdx = ind.position === 'bottom' ? overIdx + 1 : overIdx
    const next = [...filtered.slice(0, insertIdx), dragged, ...filtered.slice(insertIdx)]
    const updates = next.map((t, i) => ({ id: t.id, sort_order: i * 10 }))
    reorderTasks.mutate(updates)
  }, [dropIndicator, filteredTasks, reorderTasks])

  const handleDragCancel = useCallback(() => {
    setActiveTask(null)
    setDropIndicator(null)
  }, [])

  return (
    <div className={cn('rounded-lg', listHeight === 'full' && 'flex flex-col flex-1 min-h-0')}>
      <BoardListHeader
        list={list}
        count={count}
        collapsed={collapsed}
        onToggleCollapse={() => setUserCollapsed(!collapsed)}
        onOpenSettings={settingsDialog.open}
        hasFilters={hasFilters}
        isInbox={isInbox}
        isFirst={isFirst}
        isLast={isLast}
        siblingLists={siblingLists}
      />

      {!collapsed && (
        <div className={cn(heightClass, 'mt-1 overflow-y-auto scrollbar-hide', !isCards && !hasGrouping && 'rounded-lg border border-border/50 bg-white')}>
          {isInbox ? (
            <BoardInboxList
              threads={inboxThreads}
              onOpenThread={onOpenThread}
              selectedThreadId={selectedThreadId}
              defaultFilter={(list.filters as unknown as { default_filter?: string })?.default_filter === 'unread' ? 'unread' : 'all'}
              workspaceId={workspaceId}
            />
          ) : isProject ? (
            filteredProjects.length > 0 ? (
              <div className={cn(isCards ? 'grid gap-1' : hasGrouping ? 'flex flex-col gap-2' : 'divide-y divide-border/50')}>
                {projectGroups.map((group) => (
                  <div key={group.key}>
                    {hasGrouping && (
                      <div className={cn('px-0 pb-1')}>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium',
                            !group.color && 'bg-muted-foreground/10 text-muted-foreground',
                          )}
                          style={
                            group.color
                              ? {
                                  backgroundColor: `${group.color}1A`,
                                  color: group.color,
                                }
                              : undefined
                          }
                        >
                          {group.label}
                          <span className="opacity-50">{group.projects.length}</span>
                        </span>
                      </div>
                    )}
                    <div className={cn(
                      isCards
                        ? 'grid grid-cols-1 gap-1'
                        : hasGrouping
                          ? 'divide-y divide-border/50 rounded-lg border border-border/50 bg-white overflow-hidden'
                          : 'divide-y divide-border/50'
                    )}>
                      {group.projects.map((project) => (
                        <BoardProjectRow
                          key={project.id}
                          project={project}
                          workspaceId={workspaceId}
                          displayMode={list.display_mode ?? 'list'}
                          visibleFields={list.visible_fields ?? ['status', 'template']}
                          isSelected={selectedProjectId === project.id}
                          cardLayout={list.card_layout}
                          nextTask={nextTaskByProjectId[project.id]}
                          authorName={project.created_by ? authorNameByUserId[project.created_by] : null}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                {hasFilters ? 'Нет элементов по фильтру' : 'Пусто'}
              </div>
            )
          ) : filteredTasks.length > 0 ? (
            isManualSort ? (
              <DndContext
                sensors={sensors}
                collisionDetection={pointerWithin}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
              >
                <div className={cn(isCards ? 'grid grid-cols-1 gap-1' : 'divide-y divide-border/50')}>
                  {filteredTasks.map((task) => (
                    <DraggableBoardTaskRow
                      key={task.id}
                      task={task}
                      workspaceId={workspaceId}
                      assignees={assigneesMap[task.id] ?? []}
                      statuses={statuses}
                      visibleFields={list.visible_fields ?? ['status', 'deadline', 'assignees', 'project']}
                      displayMode={list.display_mode ?? 'list'}
                      onOpenTask={onOpenTask}
                      onStatusChange={onStatusChange}
                      isSelected={selectedThreadId === task.id}
                      cardLayout={list.card_layout}
                      dropIndicator={dropIndicator?.taskId === task.id ? dropIndicator.position : null}
                    />
                  ))}
                </div>
                <DragOverlay dropAnimation={null}>
                  {activeTask ? (
                    <div className="shadow-xl rounded-md opacity-90 bg-white">
                      <BoardTaskRow
                        task={activeTask}
                        workspaceId={workspaceId}
                        assignees={assigneesMap[activeTask.id] ?? []}
                        statuses={statuses}
                        visibleFields={list.visible_fields ?? ['status', 'deadline', 'assignees', 'project']}
                        displayMode={list.display_mode ?? 'list'}
                        onOpenTask={() => {}}
                        onStatusChange={() => {}}
                        cardLayout={list.card_layout}
                      />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            ) : (
            <div className={cn(isCards ? 'grid gap-1' : hasGrouping ? 'flex flex-col gap-2' : 'divide-y divide-border/50')}>
              {groups.map((group) => (
                <div key={group.key}>
                  {hasGrouping && (
                    <div className={cn('px-2 pb-1', isCards && 'px-0 pb-1')}>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted-foreground/10 text-[11px] font-medium text-muted-foreground">
                        {group.label}
                        <span className="opacity-50">{group.tasks.length}</span>
                      </span>
                    </div>
                  )}
                  <div className={cn(
                    isCards
                      ? 'grid grid-cols-1 gap-1'
                      : hasGrouping
                        ? 'divide-y divide-border/50 rounded-lg border border-border/50 bg-white overflow-hidden'
                        : 'divide-y divide-border/50'
                  )}>
                    {group.tasks.map((task) => (
                      <BoardTaskRow
                        key={task.id}
                        task={task}
                        workspaceId={workspaceId}
                        assignees={assigneesMap[task.id] ?? []}
                        statuses={statuses}
                        visibleFields={list.visible_fields ?? ['status', 'deadline', 'assignees', 'project']}
                        displayMode={list.display_mode ?? 'list'}
                        onOpenTask={onOpenTask}
                        onStatusChange={onStatusChange}
                        isSelected={selectedThreadId === task.id}
                        cardLayout={list.card_layout}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            )
          ) : (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              {hasFilters ? 'Нет элементов по фильтру' : 'Пусто'}
            </div>
          )}
        </div>
      )}

      <ListSettingsDialog
        open={settingsDialog.isOpen}
        onClose={settingsDialog.close}
        list={list}
        workspaceId={workspaceId}
        existingColumns={existingColumns}
        columnWidth={columnWidth}
      />
    </div>
  )
}
