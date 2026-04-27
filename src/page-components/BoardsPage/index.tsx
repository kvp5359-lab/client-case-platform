"use client"

import { useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Plus, Kanban } from 'lucide-react'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import { useDialog } from '@/hooks/shared/useDialog'
import { useBoardsQuery } from '@/components/boards/hooks/useBoardsQuery'
import { useDeleteBoard } from '@/components/boards/hooks/useBoardMutations'
import { CreateBoardDialog } from '@/components/boards/CreateBoardDialog'
import { EditBoardDialog } from '@/components/boards/EditBoardDialog'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { usePinnedBoards } from '@/components/WorkspaceSidebar/usePinnedBoards'
import { useWorkspacePermissions } from '@/hooks/permissions'
import type { Board } from '@/components/boards/types'
import { BoardTabContent } from './BoardTabContent'
import { BoardTab } from './BoardTab'
import { usePageTitle } from '@/hooks/usePageTitle'

// ── Основная страница ──────────────────────────────────────

export default function BoardsPage() {
  usePageTitle('Доски')
  const { workspaceId, boardId: boardIdFromPath } = useParams<{ workspaceId: string; boardId?: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const closePanel = useSidePanelStore((s) => s.closePanel)
  const createDialog = useDialog()
  const editDialog = useDialog()
  const createListDialog = useDialog()
  const { data: boards, isLoading } = useBoardsQuery(workspaceId)
  const deleteBoard = useDeleteBoard()
  const { isPinned: isBoardPinned, togglePin: toggleBoardPin } = usePinnedBoards(workspaceId)
  const { isOwner } = useWorkspacePermissions({ workspaceId: workspaceId || '' })

  // Закрываем боковую панель при входе на страницу досок
  useEffect(() => {
    closePanel()
  }, [closePanel])

  // Источник активной доски — путь /boards/[boardId]. Для совместимости поддерживаем
  // legacy ?board=<id> (клик из сайдбара со старыми ссылками) — мигрируем в путь.
  const legacyBoardFromQuery = searchParams.get('board')
  const requestedBoardId = boardIdFromPath ?? legacyBoardFromQuery ?? null

  const resolvedBoardId = requestedBoardId && boards?.some((b) => b.id === requestedBoardId)
    ? requestedBoardId
    : boards?.[0]?.id ?? null

  const activeBoard = boards?.find((b) => b.id === resolvedBoardId) ?? null

  const navigateToBoard = (id: string | null) => {
    if (!workspaceId) return
    const target = id ? `/workspaces/${workspaceId}/boards/${id}` : `/workspaces/${workspaceId}/boards`
    router.push(target)
  }

  // Синхронизация URL: если в пути нет boardId, но есть резолвнутая доска (например,
  // легаси-параметр ?board= или дефолтная первая) — переписываем URL чтобы был полным
  // и шарабельным.
  useEffect(() => {
    if (!workspaceId) return
    if (!resolvedBoardId) return
    if (boardIdFromPath === resolvedBoardId) return
    const target = `/workspaces/${workspaceId}/boards/${resolvedBoardId}`
    router.replace(target)
  }, [workspaceId, boardIdFromPath, resolvedBoardId, router])

  const handleDeleteBoard = (board: Board) => {
    if (!confirm(`Удалить доску «${board.name}»?`)) return
    deleteBoard.mutate(
      { id: board.id, workspace_id: workspaceId! },
      {
        onSuccess: () => {
          if (resolvedBoardId === board.id) navigateToBoard(null)
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
                      canPin={isOwner}
                      onSelect={() => navigateToBoard(board.id)}
                      onEdit={() => {
                        navigateToBoard(board.id)
                        editDialog.open()
                      }}
                      onDelete={() => handleDeleteBoard(board)}
                      onAddList={() => {
                        navigateToBoard(board.id)
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
