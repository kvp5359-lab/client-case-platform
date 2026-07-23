"use client"

import { memo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { BoardListCard } from './BoardListCard'
import type { BoardCardDndState, BoardGlobalFilter, BoardList } from './types'
import type { FilterContext } from '@/lib/filters/types'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { StatusOption } from '@/components/common/status-dropdown'
import type { BoardProject } from './hooks/useWorkspaceProjects'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { TaskItem } from '@/components/tasks/types'

type BoardColumnProps = {
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
  /** Фильтр на уровне всей доски (этап 4.1) */
  boardGlobalFilter: BoardGlobalFilter
  /** Состояние card-DnD из BoardView (этап 4.5) */
  boardCardDnd?: BoardCardDndState
  onOpenTask: (taskId: string) => void
  onOpenThread: (task: TaskItem) => void
  onStatusChange: (taskId: string, statusId: string | null) => void
  onDeleteTask?: (task: WorkspaceTask) => void
  onDeadlineChange?: (taskId: string, deadline: string | null) => void
  selectedThreadId?: string | null
  selectedProjectId?: string | null
  existingColumns?: number
  activeDragListId?: string | null
  dropIndicator?: { overListId: string; position: 'top' | 'bottom' } | null
}

// Стабильная пустая ссылка для списков без инбокса (см. комментарий у пропа ниже).
const EMPTY_INBOX_THREADS: InboxThreadEntry[] = []

// memo: колонка ре-рендерится только при смене своих пропов. Без этого каждый
// realtime-тик инбокса (~1.5с) прогонял фильтрацию/сортировку всех списков всех
// колонок (аудит 2026-07-23, находка №2).
export const BoardColumn = memo(function BoardColumn({
  lists,
  tasks,
  projects,
  inboxThreads,
  assigneesMap,
  filterCtx,
  workspaceId,
  statuses,
  width,
  boardGlobalFilter,
  boardCardDnd,
  onOpenTask,
  onOpenThread,
  onStatusChange,
  onDeleteTask,
  onDeadlineChange,
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
            // Живую ссылку inboxThreads получает только inbox-список — остальным
            // она не нужна, а её смена (каждый realtime-тик) ломала бы их memo.
            inboxThreads={list.entity_type === 'inbox' ? inboxThreads : EMPTY_INBOX_THREADS}
            assigneesMap={assigneesMap}
            filterCtx={filterCtx}
            workspaceId={workspaceId}
            statuses={statuses}
            columnWidth={width}
            boardGlobalFilter={boardGlobalFilter}
            boardCardDnd={boardCardDnd}
            onOpenTask={onOpenTask}
            onOpenThread={onOpenThread}
            onStatusChange={onStatusChange}
            onDeleteTask={onDeleteTask}
            onDeadlineChange={onDeadlineChange}
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
})

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
