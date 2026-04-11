"use client"

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Plus, Kanban, MoreVertical, Trash2, Pencil, ListPlus, Pin, PinOff } from 'lucide-react'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDialog } from '@/hooks/shared/useDialog'
import { useBoardsQuery } from '@/components/boards/hooks/useBoardsQuery'
import { useBoardLists } from '@/components/boards/hooks/useBoardQuery'
import { useWorkspaceThreads } from '@/hooks/tasks/useWorkspaceThreads'
import { useAccessibleProjects } from '@/hooks/shared/useAccessibleProjects'
import { useTaskAssigneesMap } from '@/components/tasks/useTaskAssignees'
import { useCurrentParticipantId } from '@/hooks/shared/useCurrentParticipantId'
import { useDeleteBoard } from '@/components/boards/hooks/useBoardMutations'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { useAuth } from '@/contexts/AuthContext'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useUpdateTaskStatus } from '@/components/tasks/useTaskMutations'
import { TaskPanel } from '@/components/tasks/TaskPanel'
import { useTaskPanelSetup } from '@/components/tasks/useTaskPanelSetup'
import { globalOpenThread } from '@/components/tasks/TaskPanelContext'
import { BoardView } from '@/components/boards/BoardView'
import { CreateBoardDialog } from '@/components/boards/CreateBoardDialog'
import { CreateListDialog } from '@/components/boards/CreateListDialog'
import { EditBoardDialog } from '@/components/boards/EditBoardDialog'
import { cn } from '@/lib/utils'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { taskKeys, workspaceThreadKeys } from '@/hooks/queryKeys'
import { useInboxThreadsV2 } from '@/hooks/messenger/useInbox'
import { useFilteredInbox } from '@/hooks/messenger/useFilteredInbox'
import type { Board } from '@/components/boards/types'
import { usePinnedBoards } from '@/components/WorkspaceSidebar/usePinnedBoards'
import type { TaskItem } from '@/components/tasks/types'

// ── Контент одной доски ────────────────────────────────────

function BoardTabContent({
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
    () => [taskKeys.workspace(workspaceId), workspaceThreadKeys.workspace(workspaceId)],
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
          selectedThreadId={tp.openThread?.id}
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
  )
}

// ── Вкладка доски (стиль ChatTabItem) ──────────────────────

interface BoardTabProps {
  board: Board
  isActive: boolean
  isPinned: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onAddList: () => void
  onTogglePin: () => void
}

function BoardTab({ board, isActive, isPinned, onSelect, onEdit, onDelete, onAddList, onTogglePin }: BoardTabProps) {
  return (
    <div className="flex items-center shrink-0">
      <div
        className={cn(
          'text-sm py-1 rounded-full transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer',
          isActive ? 'pl-2.5 pr-1' : 'px-2.5',
          isActive
            ? 'bg-amber-50 text-amber-700 font-medium shadow-[0_1px_4px_rgba(0,0,0,0.15)]'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
        )}
        role="tab"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
          }
        }}
      >
        <Kanban className="h-3.5 w-3.5 shrink-0" />
        <span>{board.name}</span>

        {/* Dropdown-меню — только на активной вкладке */}
        {isActive && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="p-0.5 rounded hover:bg-black/10 transition-colors"
                aria-label="Меню доски"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.stopPropagation()
                }}
              >
                <MoreVertical className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={4}>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onAddList()
                }}
              >
                <ListPlus className="h-3.5 w-3.5 mr-2" />
                Добавить список
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onTogglePin()
                }}
              >
                {isPinned ? (
                  <>
                    <PinOff className="h-3.5 w-3.5 mr-2" />
                    Открепить из сайдбара
                  </>
                ) : (
                  <>
                    <Pin className="h-3.5 w-3.5 mr-2" />
                    Закрепить в сайдбаре
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit()
                }}
              >
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Настройки
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Удалить доску
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

// ── Основная страница ──────────────────────────────────────

export default function BoardsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const searchParams = useSearchParams()
  const closePanel = useSidePanelStore((s) => s.closePanel)
  const createDialog = useDialog()
  const editDialog = useDialog()
  const createListDialog = useDialog()
  const { data: boards, isLoading } = useBoardsQuery(workspaceId)
  const deleteBoard = useDeleteBoard()
  const { isPinned: isBoardPinned, togglePin: toggleBoardPin } = usePinnedBoards(workspaceId)

  // Закрываем боковую панель при входе на страницу досок
  useEffect(() => {
    closePanel()
  }, [closePanel])

  // Инициализация из query-параметра ?board=<id> (клик из сайдбара).
  // Синхронизация при смене URL — через tracked previous (derived-update),
  // без useEffect+setState: при смене boardFromUrl локальный state подхватывает его.
  const boardFromUrl = searchParams.get('board')
  const [activeBoardId, setActiveBoardId] = useState<string | null>(boardFromUrl)
  const [prevBoardFromUrl, setPrevBoardFromUrl] = useState(boardFromUrl)
  if (boardFromUrl !== prevBoardFromUrl) {
    setPrevBoardFromUrl(boardFromUrl)
    if (boardFromUrl) setActiveBoardId(boardFromUrl)
  }

  const resolvedBoardId = activeBoardId && boards?.some((b) => b.id === activeBoardId)
    ? activeBoardId
    : boards?.[0]?.id ?? null

  const activeBoard = boards?.find((b) => b.id === resolvedBoardId) ?? null

  const handleDeleteBoard = (board: Board) => {
    if (!confirm(`Удалить доску «${board.name}»?`)) return
    deleteBoard.mutate(
      { id: board.id, workspace_id: workspaceId! },
      {
        onSuccess: () => {
          if (activeBoardId === board.id) setActiveBoardId(null)
        },
      },
    )
  }

  if (!workspaceId) return null

  return (
    <WorkspaceLayout>
      <div className="h-full flex flex-col bg-gray-100/60">
        {/* Строка вкладок */}
        <div className="flex items-center px-3 py-2 shrink-0">
          <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-1 bg-muted rounded-full p-1 w-fit group/tabs">
              {isLoading ? (
                <div className="px-3 py-0.5 text-xs text-muted-foreground">Загрузка...</div>
              ) : (
                <>
                  {boards?.map((board) => (
                    <BoardTab
                      key={board.id}
                      board={board}
                      isActive={resolvedBoardId === board.id}
                      isPinned={isBoardPinned(board.id)}
                      onSelect={() => setActiveBoardId(board.id)}
                      onEdit={() => {
                        setActiveBoardId(board.id)
                        editDialog.open()
                      }}
                      onDelete={() => handleDeleteBoard(board)}
                      onAddList={() => {
                        setActiveBoardId(board.id)
                        createListDialog.open()
                      }}
                      onTogglePin={() => toggleBoardPin(board.id)}
                    />
                  ))}
                  <button
                    type="button"
                    className="p-1 rounded-full shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all opacity-0 group-hover/tabs:opacity-100"
                    onClick={createDialog.open}
                    title="Новая доска"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        {!isLoading && boards?.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
            <Kanban className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">Пока нет досок</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={createDialog.open}
            >
              Создать первую доску
            </Button>
          </div>
        ) : activeBoard ? (
          <BoardTabContent
            key={activeBoard.id}
            board={activeBoard}
            workspaceId={workspaceId}
            createListDialog={createListDialog}
          />
        ) : null}
      </div>

      <CreateBoardDialog
        open={createDialog.isOpen}
        onClose={createDialog.close}
        workspaceId={workspaceId}
      />

      {activeBoard && (
        <EditBoardDialog
          open={editDialog.isOpen}
          onClose={editDialog.close}
          board={activeBoard}
        />
      )}
    </WorkspaceLayout>
  )
}
