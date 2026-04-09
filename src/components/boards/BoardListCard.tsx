"use client"

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Filter, MoreHorizontal, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDialog } from '@/hooks/shared/useDialog'
import { useDeleteList } from './hooks/useListMutations'
import { useFilteredTasks } from './hooks/useFilteredListData'
import { BoardTaskRow } from './BoardTaskRow'
import { BoardProjectRow } from './BoardProjectRow'
import { BoardInboxList } from './BoardInboxList'
import { ListSettingsDialog } from './ListSettingsDialog'
import type { BoardList, FilterContext, GroupByField } from './types'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceTasks'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { StatusOption } from '@/components/ui/status-dropdown'
import type { BoardProject } from './hooks/useWorkspaceProjects'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { TaskItem } from '@/components/tasks/types'

// ── Группировка ─────────────────────────────────────────

interface TaskGroup {
  key: string
  label: string
  tasks: WorkspaceTask[]
}

function formatDeadlineGroup(deadline: string | null): string {
  if (!deadline) return 'Без дедлайна'
  const d = new Date(deadline)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const taskDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((taskDate.getTime() - today.getTime()) / 86400000)

  if (diffDays < 0) return 'Просрочено'
  if (diffDays === 0) return 'Сегодня'
  if (diffDays === 1) return 'Завтра'
  if (diffDays <= 7) return 'На этой неделе'
  return 'Позже'
}

function groupTasks(
  tasks: WorkspaceTask[],
  groupBy: GroupByField,
  assigneesMap: Record<string, AvatarParticipant[]>,
  statuses: StatusOption[],
): TaskGroup[] {
  if (groupBy === 'none') return [{ key: '__all__', label: '', tasks }]

  const map = new Map<string, WorkspaceTask[]>()
  const labelMap = new Map<string, string>()

  for (const task of tasks) {
    let keys: string[]

    switch (groupBy) {
      case 'status': {
        const k = task.status_id ?? '__none__'
        const s = statuses.find((s) => s.id === task.status_id)
        keys = [k]
        labelMap.set(k, s?.name ?? 'Без статуса')
        break
      }
      case 'project': {
        const k = task.project_id ?? '__none__'
        keys = [k]
        labelMap.set(k, task.project_name ?? 'Без проекта')
        break
      }
      case 'assignee': {
        const a = assigneesMap[task.id] ?? []
        if (a.length === 0) {
          keys = ['__none__']
          labelMap.set('__none__', 'Без исполнителя')
        } else {
          keys = a.map((p) => {
            labelMap.set(p.id, `${p.name}${p.last_name ? ` ${p.last_name}` : ''}`)
            return p.id
          })
        }
        break
      }
      case 'deadline': {
        const label = formatDeadlineGroup(task.deadline)
        keys = [label]
        labelMap.set(label, label)
        break
      }
      default:
        keys = ['__all__']
        labelMap.set('__all__', '')
    }

    for (const k of keys) {
      const arr = map.get(k)
      if (arr) arr.push(task)
      else map.set(k, [task])
    }
  }

  const groups: TaskGroup[] = []
  for (const [key, groupTasks] of map) {
    groups.push({ key, label: labelMap.get(key) ?? key, tasks: groupTasks })
  }

  // Фиксированный порядок групп для дедлайнов
  if (groupBy === 'deadline') {
    const DEADLINE_ORDER = ['Просрочено', 'Сегодня', 'Завтра', 'На этой неделе', 'Позже', 'Без дедлайна']
    groups.sort((a, b) => {
      const ai = DEADLINE_ORDER.indexOf(a.label)
      const bi = DEADLINE_ORDER.indexOf(b.label)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }

  return groups
}

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
  existingColumns?: number
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
  existingColumns,
}: BoardListCardProps) {
  const [collapsed, setCollapsed] = useState(false)
  const filterDialog = useDialog()
  const deleteList = useDeleteList()

  // Приводим assigneesMap к формату { id: string }[] для движка
  const simpleAssigneesMap = useMemo(() => {
    const result: Record<string, { id: string }[]> = {}
    for (const [key, val] of Object.entries(assigneesMap)) {
      result[key] = val.map((a) => ({ id: a.id }))
    }
    return result
  }, [assigneesMap])

  const safeFilters = list.entity_type === 'inbox'
    ? { logic: 'and' as const, rules: [] }
    : list.filters

  const filteredTasks = useFilteredTasks(
    list.entity_type === 'task' ? tasks : [],
    safeFilters,
    filterCtx,
    simpleAssigneesMap,
    list.sort_by ?? 'created_at',
    list.sort_dir ?? 'desc',
  )

  const isProject = list.entity_type === 'project'
  const isInbox = list.entity_type === 'inbox'
  const hasFilters = safeFilters.rules.length > 0
  const count = isInbox ? inboxThreads.length : isProject ? projects.length : filteredTasks.length
  const CollapseIcon = collapsed ? ChevronRight : ChevronDown
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
  const hasGrouping = groupByField !== 'none'

  return (
    <div className={cn('rounded-lg', listHeight === 'full' && 'flex flex-col flex-1 min-h-0')}>
      {/* Header */}
      <div className="flex items-center gap-1.5 py-2">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="p-0.5 hover:bg-accent rounded"
        >
          <CollapseIcon className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium flex-1 truncate">{list.name}</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {list.entity_type === 'task' ? 'Задачи' : list.entity_type === 'project' ? 'Проекты' : 'Входящие'}
        </Badge>
        {count > 0 && (
          <span className="text-xs text-muted-foreground">{count}</span>
        )}
        {!isInbox && (
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-6 w-6', hasFilters && 'text-primary')}
            onClick={filterDialog.open}
          >
            <Filter className="h-3 w-3" />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={filterDialog.open}>
              <Filter className="h-3.5 w-3.5 mr-2" />
              Фильтры
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() =>
                deleteList.mutate({ id: list.id, board_id: list.board_id })
              }
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Удалить список
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className={cn(heightClass, 'overflow-y-auto', !isCards && 'rounded-lg border bg-white')}>
          {isInbox ? (
            <BoardInboxList
              threads={inboxThreads}
              onOpenThread={onOpenThread}
              selectedThreadId={selectedThreadId}
              defaultFilter={(list.filters as unknown as { default_filter?: string })?.default_filter === 'unread' ? 'unread' : 'all'}
              workspaceId={workspaceId}
            />
          ) : isProject ? (
            projects.length > 0 ? (
              <div className={cn(isCards ? 'grid gap-1' : 'divide-y')}>
                {projects.map((project) => (
                  <BoardProjectRow
                    key={project.id}
                    project={project}
                    workspaceId={workspaceId}
                    displayMode={list.display_mode ?? 'list'}
                    visibleFields={list.visible_fields ?? ['status', 'template']}
                  />
                ))}
              </div>
            ) : (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">Пусто</div>
            )
          ) : filteredTasks.length > 0 ? (
            <div className={cn(isCards ? 'grid gap-1' : 'divide-y')}>
              {groups.map((group) => (
                <div key={group.key}>
                  {hasGrouping && (
                    <div className={cn(
                      'px-3 py-1.5 text-[11px] font-medium text-muted-foreground bg-muted/50',
                      isCards && 'px-0 pt-2 pb-1',
                    )}>
                      {group.label}
                      <span className="ml-1.5 text-[10px] opacity-60">{group.tasks.length}</span>
                    </div>
                  )}
                  <div className={cn(isCards ? 'grid gap-1' : 'divide-y')}>
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
          )}
        </div>
      )}

      {/* Настройки списка */}
      <ListSettingsDialog
        open={filterDialog.isOpen}
        onClose={filterDialog.close}
        list={list}
        workspaceId={workspaceId}
        existingColumns={existingColumns}
      />
    </div>
  )
}
