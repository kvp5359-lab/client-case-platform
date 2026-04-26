"use client"

import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { BoardListCard } from './BoardListCard'
import type { BoardList, FilterContext } from './types'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
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
  /** Ширина колонки в px */
  width: number
  onOpenTask: (taskId: string) => void
  onOpenThread: (task: TaskItem) => void
  onStatusChange: (taskId: string, statusId: string | null) => void
  selectedThreadId?: string | null
  selectedProjectId?: string | null
  existingColumns?: number
  activeDragListId?: string | null
  dropIndicator?: { overListId: string; position: 'top' | 'bottom' } | null
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
  width,
  onOpenTask,
  onOpenThread,
  onStatusChange,
  selectedThreadId,
  selectedProjectId,
  existingColumns,
  activeDragListId,
  dropIndicator,
}: BoardColumnProps) {
  return (
    <div className="flex flex-col gap-[30px] shrink-0 h-full" style={{ width: `${width}px` }}>
      {lists.map((list, index) => (
        <DroppableListWrapper
          key={list.id}
          listId={list.id}
          columnIndex={list.column_index}
          isFullHeight={(list.list_height ?? 'auto') === 'full'}
          isDragging={activeDragListId === list.id}
          indicator={dropIndicator?.overListId === list.id ? dropIndicator.position : null}
        >
          <BoardListCard
            list={list}
            tasks={tasks}
            projects={projects}
            inboxThreads={inboxThreads}
            assigneesMap={assigneesMap}
            filterCtx={filterCtx}
            workspaceId={workspaceId}
            statuses={statuses}
            columnWidth={width}
            onOpenTask={onOpenTask}
            onOpenThread={onOpenThread}
            onStatusChange={onStatusChange}
            selectedThreadId={selectedThreadId}
            selectedProjectId={selectedProjectId}
            existingColumns={existingColumns}
            isFirst={index === 0}
            isLast={index === lists.length - 1}
            siblingLists={lists}
          />
        </DroppableListWrapper>
      ))}
    </div>
  )
}

function DroppableListWrapper({
  listId,
  columnIndex,
  isFullHeight,
  isDragging,
  indicator,
  children,
}: {
  listId: string
  columnIndex: number
  isFullHeight: boolean
  isDragging: boolean
  indicator: 'top' | 'bottom' | null
  children: React.ReactNode
}) {
  const { setNodeRef } = useDroppable({
    id: `list-drop:${listId}`,
    data: { columnIndex },
  })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative',
        // Пробрасываем flex-поведение списка до wrapper'а: для list_height='full'
        // BoardListCard ожидает быть flex-item с flex-1 min-h-0 в столбце.
        isFullHeight && 'flex flex-col flex-1 min-h-0',
        isDragging && 'opacity-40',
      )}
    >
      {indicator === 'top' && (
        <div className="absolute -top-2 left-0 right-0 h-0.5 rounded-full bg-blue-500 pointer-events-none" />
      )}
      {children}
      {indicator === 'bottom' && (
        <div className="absolute -bottom-2 left-0 right-0 h-0.5 rounded-full bg-blue-500 pointer-events-none" />
      )}
    </div>
  )
}
