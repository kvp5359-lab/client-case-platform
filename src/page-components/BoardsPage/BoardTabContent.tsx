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
import { TaskPanel } from '@/components/tasks/TaskPanel'
import { useTaskPanelSetup } from '@/components/tasks/useTaskPanelSetup'
import { globalOpenThread } from '@/components/tasks/TaskPanelContext'
import { BoardView } from '@/components/boards/BoardView'
import { CreateListDialog } from '@/components/boards/CreateListDialog'
import { TaskPanelContext } from '@/components/tasks/TaskPanelContext'
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
  const { data: tasks } = useWorkspaceThreads(hasTaskLists ? workspaceId : undefined)
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

  // TaskPanel
  const tp = useTaskPanelSetup({
    workspaceId,
    extraInvalidateKeys: [workspaceThreadKeys.workspace(workspaceId)],
  })

  const handleOpenTask = useCallback((taskId: string) => {
    const t = (tasks ?? []).find((x) => x.id === taskId)
    if (!t) return
    tp.setOpenThread({
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
  }, [tasks, tp])

  const handleOpenThread = useCallback((task: TaskItem) => {
    tp.setOpenThread({ ...task, workspace_id: workspaceId })
  }, [tp, workspaceId])

  // Локальный контекст TaskPanel для доски: клики внутри BoardTabContent
  // (в т.ч. BoardProjectRow.openProject) идут в локальный tp, а не в
  // layout-уровневую панель из WorkspaceLayout. Так доска управляет
  // собственной TaskPanel, которая передаётся в layout при навигации на проект.
  const boardTaskPanelCtx = useMemo(
    () => ({
      openThread: tp.setOpenThread,
      pushThread: tp.pushThread,
      openProject: tp.openProjectTasks,
      pushProject: tp.pushProject,
      closeThread: () => tp.setOpenThread(null),
    }),
    [tp],
  )

  return (
    <TaskPanelContext.Provider value={boardTaskPanelCtx}>
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
            selectedThreadId={tp.openThread?.id}
            selectedProjectId={tp.openProject?.id}
          />
        </div>

        {/* Панель задачи (правая боковая) */}
        <TaskPanel
          {...tp.taskPanelProps}
          showProjectLink
          onProjectClick={() => {
            // Передаём открытый тред в layout-уровневую TaskPanel,
            // чтобы панель пережила размонтирование BoardsPage при навигации
            // на страницу проекта. Затем локальную копию закрываем.
            if (tp.openThread) globalOpenThread(tp.openThread)
            tp.setOpenThread(null)
          }}
        />

        <CreateListDialog
          open={createListDialog.isOpen}
          onClose={createListDialog.close}
          boardId={board.id}
          existingColumns={lists ? Math.max(0, ...lists.map((l) => l.column_index)) + 1 : 1}
        />
      </div>
    </TaskPanelContext.Provider>
  )
}
