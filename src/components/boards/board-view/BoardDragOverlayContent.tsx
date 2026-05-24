"use client"

/**
 * Рендер контента DragOverlay в BoardView: что показывать при drag.
 * Три случая: перетаскивание списка (pill), перетаскивание карточки-проекта
 * (BoardProjectRow в рамке), перетаскивание карточки-задачи (BoardTaskRow).
 */

import { BoardProjectRow } from '../BoardProjectRow'
import { BoardTaskRow } from '../BoardTaskRow'
import { hexToHeaderStyle, type BoardList } from '../types'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { StatusOption } from '@/components/common/status-dropdown'
import type { BoardProject } from '../hooks/useWorkspaceProjects'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'

type Props = {
  isOverCalendar: boolean
  activeList: BoardList | null
  activeCard:
    | { kind: 'task'; task: WorkspaceTask; sourceListId: string }
    | { kind: 'project'; project: BoardProject; sourceListId: string }
    | null
  lists: BoardList[]
  workspaceId: string
  assigneesMap: Record<string, AvatarParticipant[]>
  statuses: StatusOption[]
}

export function BoardDragOverlayContent({
  isOverCalendar,
  activeList,
  activeCard,
  lists,
  workspaceId,
  assigneesMap,
  statuses,
}: Props) {
  if (isOverCalendar) return null

  if (activeList) {
    return (
      <div
        className="px-3 py-1 rounded-full text-sm font-medium shadow-lg"
        style={{
          backgroundColor: hexToHeaderStyle(activeList.header_color).bg,
          color: hexToHeaderStyle(activeList.header_color).text,
        }}
      >
        {activeList.name}
      </div>
    )
  }

  if (activeCard?.kind === 'project') {
    const sourceList = lists.find((l) => l.id === activeCard.sourceListId)
    return (
      <div className="shadow-xl rounded-md opacity-90 bg-white">
        <BoardProjectRow
          project={activeCard.project}
          workspaceId={workspaceId}
          displayMode={sourceList?.display_mode ?? 'list'}
          visibleFields={sourceList?.visible_fields ?? ['status', 'template']}
          cardLayout={sourceList?.card_layout ?? null}
        />
      </div>
    )
  }

  if (activeCard?.kind === 'task') {
    const sourceList = lists.find((l) => l.id === activeCard.sourceListId)
    return (
      <div className="shadow-xl rounded-md opacity-90 bg-white">
        <BoardTaskRow
          task={activeCard.task}
          workspaceId={workspaceId}
          assignees={assigneesMap[activeCard.task.id] ?? []}
          statuses={statuses}
          visibleFields={sourceList?.visible_fields ?? ['status', 'deadline', 'assignees', 'project']}
          displayMode={sourceList?.display_mode ?? 'list'}
          cardLayout={sourceList?.card_layout ?? null}
          onOpenTask={() => {}}
          onStatusChange={() => {}}
        />
      </div>
    )
  }

  return null
}
