"use client"

import { BoardListCard } from './BoardListCard'
import type { BoardList, FilterContext } from './types'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceTasks'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { StatusOption } from '@/components/ui/status-dropdown'
import type { BoardProject } from './hooks/useWorkspaceProjects'

interface BoardColumnProps {
  lists: BoardList[]
  tasks: WorkspaceTask[]
  projects: BoardProject[]
  assigneesMap: Record<string, AvatarParticipant[]>
  filterCtx: FilterContext
  workspaceId: string
  statuses: StatusOption[]
  onOpenTask: (taskId: string) => void
  onStatusChange: (taskId: string, statusId: string | null) => void
}

export function BoardColumn({
  lists,
  tasks,
  projects,
  assigneesMap,
  filterCtx,
  workspaceId,
  statuses,
  onOpenTask,
  onStatusChange,
}: BoardColumnProps) {
  return (
    <div className="flex flex-col gap-3 w-[340px] shrink-0">
      {lists.map((list) => (
        <BoardListCard
          key={list.id}
          list={list}
          tasks={tasks}
          projects={projects}
          assigneesMap={assigneesMap}
          filterCtx={filterCtx}
          workspaceId={workspaceId}
          statuses={statuses}
          onOpenTask={onOpenTask}
          onStatusChange={onStatusChange}
        />
      ))}
    </div>
  )
}
