"use client"

import { useMemo } from 'react'
import { BoardColumn } from './BoardColumn'
import type { BoardList, FilterContext } from './types'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceTasks'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { StatusOption } from '@/components/ui/status-dropdown'
import type { BoardProject } from './hooks/useWorkspaceProjects'

interface BoardViewProps {
  lists: BoardList[]
  tasks: WorkspaceTask[]
  projects: BoardProject[]
  assigneesMap: Record<string, AvatarParticipant[]>
  workspaceId: string
  currentParticipantId: string | null
  currentUserId: string | null
  userToParticipantMap?: Record<string, string>
  statuses?: StatusOption[]
  onOpenTask?: (taskId: string) => void
  onStatusChange?: (taskId: string, statusId: string | null) => void
}

export function BoardView({
  lists,
  tasks,
  projects,
  assigneesMap,
  workspaceId,
  currentParticipantId,
  currentUserId,
  userToParticipantMap,
  statuses,
  onOpenTask,
  onStatusChange,
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
      {columns.map((col) => (
        <BoardColumn
          key={col.index}
          lists={col.lists}
          tasks={tasks}
          projects={projects}
          assigneesMap={assigneesMap}
          filterCtx={filterCtx}
          workspaceId={workspaceId}
          statuses={statuses ?? []}
          onOpenTask={onOpenTask ?? (() => {})}
          onStatusChange={onStatusChange ?? (() => {})}
        />
      ))}
    </div>
  )
}
