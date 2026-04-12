"use client"

import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Settings, Plus } from 'lucide-react'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import { useDialog } from '@/hooks/shared/useDialog'
import { useBoardDetail, useBoardLists } from '@/components/boards/hooks/useBoardQuery'
import { useWorkspaceThreads } from '@/hooks/tasks/useWorkspaceThreads'
import { useAccessibleProjects } from '@/hooks/shared/useAccessibleProjects'
import { useTaskAssigneesMap } from '@/components/tasks/useTaskAssignees'
import { useCurrentParticipantId } from '@/hooks/shared/useCurrentParticipantId'
import { useAuth } from '@/contexts/AuthContext'
import { BoardView } from '@/components/boards/BoardView'
import { CreateListDialog } from '@/components/boards/CreateListDialog'
import { EditBoardDialog } from '@/components/boards/EditBoardDialog'

export default function BoardPage() {
  const { workspaceId, boardId } = useParams<{ workspaceId: string; boardId: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const createListDialog = useDialog()
  const editBoardDialog = useDialog()

  const { data: board, isLoading: boardLoading } = useBoardDetail(boardId)
  const { data: lists } = useBoardLists(boardId)

  // Пул данных: задачи + проекты
  const hasTaskLists = lists?.some((l) => l.entity_type === 'task')
  const hasProjectLists = lists?.some((l) => l.entity_type === 'project')
  const { data: tasks } = useWorkspaceThreads(hasTaskLists ? workspaceId : undefined)
  const { data: projects } = useAccessibleProjects(hasProjectLists ? workspaceId : undefined)

  // Исполнители задач
  const taskIds = (tasks ?? []).map((t) => t.id)
  const { data: assigneesMap } = useTaskAssigneesMap(taskIds)

  // Контекст пользователя для __me__
  const { data: currentParticipantId } = useCurrentParticipantId(workspaceId)

  if (!workspaceId || !boardId) return null

  return (
    <WorkspaceLayout>
      <div className="h-full flex flex-col bg-white">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push(`/workspaces/${workspaceId}/boards`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold flex-1 truncate">
            {boardLoading ? 'Загрузка...' : board?.name ?? 'Доска'}
          </h1>
          <Button variant="ghost" size="sm" onClick={createListDialog.open}>
            <Plus className="h-4 w-4 mr-1" />
            Список
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={editBoardDialog.open}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {/* Board content */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <BoardView
            lists={lists ?? []}
            tasks={tasks ?? []}
            projects={projects ?? []}
            inboxThreads={[]}
            assigneesMap={assigneesMap ?? {}}
            workspaceId={workspaceId}
            currentParticipantId={currentParticipantId ?? null}
            currentUserId={user?.id ?? null}
            columnWidths={board?.column_widths}
          />
        </div>
      </div>

      <CreateListDialog
        open={createListDialog.isOpen}
        onClose={createListDialog.close}
        boardId={boardId}
        existingColumns={lists ? Math.max(0, ...lists.map((l) => l.column_index)) + 1 : 1}
      />

      {board && (
        <EditBoardDialog
          open={editBoardDialog.isOpen}
          onClose={editBoardDialog.close}
          board={board}
        />
      )}
    </WorkspaceLayout>
  )
}
