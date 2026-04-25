"use client"

import { useMemo, useCallback } from 'react'
import { useBoardLists } from '@/components/boards/hooks/useBoardQuery'
import { useWorkspaceThreads } from '@/hooks/tasks/useWorkspaceThreads'
import { useAccessibleProjects } from '@/hooks/shared/useAccessibleProjects'
import { useTaskAssigneesMap } from '@/components/tasks/useTaskAssignees'
import { useCurrentParticipantId } from '@/hooks/shared/useCurrentParticipantId'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { useAuth } from '@/contexts/AuthContext'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useUpdateTaskStatus } from '@/components/tasks/useTaskMutations'
import { useLayoutTaskPanel } from '@/components/tasks/TaskPanelContext'
import { BoardView } from '@/components/boards/BoardView'
import { CreateListDialog } from '@/components/boards/CreateListDialog'
import { workspaceThreadKeys } from '@/hooks/queryKeys'
import { useInboxThreadsV2 } from '@/hooks/messenger/useInbox'
import { useFilteredInbox } from '@/hooks/messenger/useFilteredInbox'
import type { Board } from '@/components/boards/types'
import type { TaskItem } from '@/components/tasks/types'

export function BoardTabContent({
  board,
  workspaceId,
  createListDialog,
}: {
  board: Board
  workspaceId: string
  createListDialog: { isOpen: boolean; open: () => void; close: () => void }
}) {
  const { user } = useAuth()
  // Загружаем inbox-кеш, чтобы UnreadBadge в карточках работал
  useInboxThreadsV2(workspaceId)
  const { data: lists } = useBoardLists(board.id)

  const hasTaskLists = lists?.some((l) => l.entity_type === 'task')
  const hasProjectLists = lists?.some((l) => l.entity_type === 'project')
  const hasInboxLists = lists?.some((l) => l.entity_type === 'inbox')
  // Треды нужны и для task-listов, и для project-listов (поле «Ближайшая задача»
  // вычисляется на клиенте из уже загруженного кэша — без доп. запросов).
  const { data: tasks } = useWorkspaceThreads(
    hasTaskLists || hasProjectLists ? workspaceId : undefined,
  )
  const { data: projects } = useAccessibleProjects(hasProjectLists ? workspaceId : undefined)
  const { data: inboxThreads = [] } = useFilteredInbox(hasInboxLists ? workspaceId : '')

  const taskIds = (tasks ?? []).map((t) => t.id)
  const { data: assigneesMap } = useTaskAssigneesMap(taskIds)

  const { data: currentParticipantId } = useCurrentParticipantId(workspaceId)
  const { data: participants } = useWorkspaceParticipants(workspaceId)
  const { data: taskStatuses } = useTaskStatuses(workspaceId)

  const userToParticipantMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of participants ?? []) {
      if (p.user_id) map[p.user_id] = p.id
    }
    return map
  }, [participants])

  const statuses = taskStatuses ?? []

  // Мутации задач (статус — отдельно для BoardView inline-change)
  const boardInvalidateKeys = useMemo(
    () => [workspaceThreadKeys.workspace(workspaceId), workspaceThreadKeys.workspace(workspaceId)],
    [workspaceId],
  )
  const updateStatus = useUpdateTaskStatus(boardInvalidateKeys)

  // TaskPanel — единая layout-уровневая через TaskPanelContext.
  // BoardTabContent больше не держит свой локальный TaskPanel — все клики
  // идут в layout shell (новая система вкладок per-project).
  const layoutPanel = useLayoutTaskPanel()

  const handleOpenTask = useCallback((taskId: string) => {
    const t = (tasks ?? []).find((x) => x.id === taskId)
    if (!t) return
    layoutPanel?.openThread({
      id: t.id,
      name: t.name,
      type: (t.type as 'chat' | 'task') ?? 'task',
      project_id: t.project_id,
      workspace_id: t.workspace_id,
      status_id: t.status_id,
      deadline: t.deadline,
      accent_color: t.accent_color,
      icon: t.icon,
      is_pinned: t.is_pinned,
      created_at: t.created_at,
      created_by: t.created_by,
      sort_order: t.sort_order,
      project_name: t.project_name,
    })
  }, [tasks, layoutPanel])

  const handleOpenThread = useCallback((task: TaskItem) => {
    layoutPanel?.openThread({ ...task, workspace_id: workspaceId })
  }, [layoutPanel, workspaceId])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <BoardView
          lists={lists ?? []}
          tasks={tasks ?? []}
          projects={projects ?? []}
          inboxThreads={inboxThreads}
          assigneesMap={assigneesMap ?? {}}
          workspaceId={workspaceId}
          currentParticipantId={currentParticipantId ?? null}
          currentUserId={user?.id ?? null}
          userToParticipantMap={userToParticipantMap}
          statuses={statuses}
          columnWidths={board.column_widths}
          onOpenTask={handleOpenTask}
          onOpenThread={handleOpenThread}
          onStatusChange={(taskId, statusId) => updateStatus.mutate({ threadId: taskId, statusId })}
          selectedThreadId={layoutPanel?.activeThreadId ?? null}
          selectedProjectId={layoutPanel?.activeProjectId ?? null}
        />
      </div>

      <CreateListDialog
        open={createListDialog.isOpen}
        onClose={createListDialog.close}
        boardId={board.id}
        existingColumns={lists ? Math.max(0, ...lists.map((l) => l.column_index)) + 1 : 1}
      />
    </div>
  )
}
