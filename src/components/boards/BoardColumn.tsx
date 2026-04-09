"use client"

import { BoardListCard } from './BoardListCard'
import type { BoardList, FilterContext } from './types'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceTasks'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { StatusOption } from '@/components/ui/status-dropdown'
import type { BoardProject } from './hooks/useWorkspaceProjects'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { TaskItem } from '@/components/tasks/types'

interface BoardColumnProps {
  lists: BoardList[]
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

export function BoardColumn({
  lists,
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
}: BoardColumnProps) {
  return (
    <div className="flex flex-col gap-5 w-[340px] shrink-0 h-full">
      {lists.map((list, index) => (
        <BoardListCard
          key={list.id}
          list={list}
          tasks={tasks}
          projects={projects}
          inboxThreads={inboxThreads}
          assigneesMap={assigneesMap}
          filterCtx={filterCtx}
          workspaceId={workspaceId}
          statuses={statuses}
          onOpenTask={onOpenTask}
          onOpenThread={onOpenThread}
          onStatusChange={onStatusChange}
          selectedThreadId={selectedThreadId}
          existingColumns={existingColumns}
          isFirst={index === 0}
          isLast={index === lists.length - 1}
          siblingLists={lists}
        />
      ))}
    </div>
  )
}
