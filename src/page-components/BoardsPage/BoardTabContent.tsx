"use client"

import { useMemo, useCallback } from 'react'
import { useBoardLists } from '@/components/boards/hooks/useBoardQuery'
import { useBoardThreads, useBoardProjects } from '@/components/boards/hooks/useBoardData'
import { useTaskAssigneesMap } from '@/components/tasks/useTaskAssignees'
import { useCurrentParticipantId } from '@/hooks/shared/useCurrentParticipantId'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { useAuth } from '@/contexts/AuthContext'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useUpdateTaskStatus, useUpdateTaskDeadline } from '@/components/tasks/useTaskMutations'
import { useDeleteThread } from '@/hooks/messenger/useProjectThreads'
import { useWorkspacePermissions } from '@/hooks/permissions'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import { useLayoutTaskPanel } from '@/components/tasks/TaskPanelContext'
import { BoardView } from '@/components/boards/BoardView'
import { CreateListDialog } from '@/components/boards/CreateListDialog'
import { workspaceThreadKeys, boardFilteredKeys } from '@/hooks/queryKeys'
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

  const hasTaskLists = lists?.some((l) => l.entity_type === 'thread')
  const hasProjectLists = lists?.some((l) => l.entity_type === 'project')
  const hasInboxLists = lists?.some((l) => l.entity_type === 'inbox')

  const { data: currentParticipantId } = useCurrentParticipantId(workspaceId)

  // Серверная фильтрация (вариант A): доска отправляет union-фильтр своих
  // списков и получает только подходящие строки. Треды нужны только task-листам;
  // «ближайшая задача» для project-листов считается на сервере (next_task_*).
  const { data: tasks } = useBoardThreads(
    workspaceId, lists ?? [], board.global_filter, currentParticipantId ?? null, !!hasTaskLists,
  )
  const { data: projects } = useBoardProjects(
    workspaceId, lists ?? [], board.global_filter, currentParticipantId ?? null, !!hasProjectLists,
  )
  const { data: inboxThreads = [] } = useFilteredInbox(hasInboxLists ? workspaceId : '')

  const taskIds = (tasks ?? []).map((t) => t.id)
  const { data: assigneesMap } = useTaskAssigneesMap(taskIds)

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
    () => [
      workspaceThreadKeys.workspace(workspaceId),
      // Серверно-фильтрованные треды доски (вариант A) — иначе после смены
      // статуса/дедлайна карточка не переедет в нужную колонку до reload.
      boardFilteredKeys.threadsAll(workspaceId),
    ],
    [workspaceId],
  )
  const updateStatus = useUpdateTaskStatus(boardInvalidateKeys)
  const updateDeadline = useUpdateTaskDeadline(boardInvalidateKeys)
  const deleteThreadMutation = useDeleteThread(workspaceId)
  // Гейтим «Удалить» в карточном меню — только владельцу воркспейса (см.
  // комментарий в TaskListView.tsx — RLS пропускает любого с access к треду).
  const { isOwner: isWorkspaceOwner } = useWorkspacePermissions({ workspaceId })

  const handleDeleteTask = useCallback(
    (t: WorkspaceTask) => {
      if (!confirm(`Удалить «${t.name}»? Можно восстановить из корзины.`)) return
      deleteThreadMutation.mutate({
        id: t.id,
        name: t.name,
        type: (t.type as 'chat' | 'task') ?? 'task',
        project_id: t.project_id,
      })
    },
    [deleteThreadMutation],
  )

  const handleDeadlineChange = useCallback(
    (taskId: string, deadline: string | null) => {
      updateDeadline.mutate({ threadId: taskId, deadline })
    },
    [updateDeadline],
  )

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
      <div className="flex-1 overflow-x-auto overflow-y-hidden snap-x snap-mandatory md:snap-none">
        <BoardView
          boardId={board.id}
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
          boardGlobalFilter={board.global_filter}
          onOpenTask={handleOpenTask}
          onOpenThread={handleOpenThread}
          onStatusChange={(taskId, statusId) => updateStatus.mutate({ threadId: taskId, statusId })}
          onDeleteTask={isWorkspaceOwner ? handleDeleteTask : undefined}
          onDeadlineChange={handleDeadlineChange}
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
