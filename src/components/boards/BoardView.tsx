"use client"

import { useMemo } from 'react'
import { BoardColumn } from './BoardColumn'
import { DEFAULT_COLUMN_WIDTH, type BoardList, type FilterContext } from './types'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { StatusOption } from '@/components/ui/status-dropdown'
import type { BoardProject } from './hooks/useWorkspaceProjects'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { TaskItem } from '@/components/tasks/types'

interface BoardViewProps {
  lists: BoardList[]
  tasks: WorkspaceTask[]
  projects: BoardProject[]
  inboxThreads: InboxThreadEntry[]
  assigneesMap: Record<string, AvatarParticipant[]>
  workspaceId: string
  currentParticipantId: string | null
  currentUserId: string | null
  userToParticipantMap?: Record<string, string>
  statuses?: StatusOption[]
  /** Массив ширин колонок в px по индексу (из board.column_widths) */
  columnWidths?: number[]
  onOpenTask?: (taskId: string) => void
  onOpenThread?: (task: TaskItem) => void
  onStatusChange?: (taskId: string, statusId: string | null) => void
  selectedThreadId?: string | null
  /** id проекта, открытого в боковой панели — соответствующая строка подсвечивается. */
  selectedProjectId?: string | null
}

export function BoardView({
  lists,
  tasks,
  projects,
  inboxThreads,
  assigneesMap,
  workspaceId,
  currentParticipantId,
  currentUserId,
  userToParticipantMap,
  statuses,
  columnWidths,
  onOpenTask,
  onOpenThread,
  onStatusChange,
  selectedThreadId,
  selectedProjectId,
}: BoardViewProps) {
  const columns = useMemo(() => {
    const map = new Map<number, BoardList[]>()
    for (const list of lists) {
      const col = list.column_index
      if (!map.has(col)) map.set(col, [])
      map.get(col)!.push(list)
    }
    for (const col of map.values()) {
      col.sort((a, b) => a.sort_order - b.sort_order)
    }
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, columnLists]) => ({ index, lists: columnLists }))
  }, [lists])

  const filterCtx: FilterContext = useMemo(
    () => ({
      currentParticipantId,
      currentUserId,
      now: new Date(),
      userToParticipantMap,
    }),
    [currentParticipantId, currentUserId, userToParticipantMap],
  )

  if (lists.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Добавьте первый список, чтобы начать
      </div>
    )
  }

  return (
    <div className="flex gap-4 p-4 h-full min-w-min">
      {columns.map((col, idx) => (
        <BoardColumn
          key={col.index}
          lists={col.lists}
          tasks={tasks}
          projects={projects}
          inboxThreads={inboxThreads}
          assigneesMap={assigneesMap}
          filterCtx={filterCtx}
          workspaceId={workspaceId}
          statuses={statuses ?? []}
          width={columnWidths?.[idx] ?? DEFAULT_COLUMN_WIDTH}
          onOpenTask={onOpenTask ?? (() => {})}
          onOpenThread={onOpenThread ?? (() => {})}
          onStatusChange={onStatusChange ?? (() => {})}
          selectedThreadId={selectedThreadId}
          selectedProjectId={selectedProjectId}
          existingColumns={columns.length}
        />
      ))}
    </div>
  )
}
