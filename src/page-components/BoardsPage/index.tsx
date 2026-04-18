"use client"

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
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
import type { Board } from '@/components/boards/types'
import { BoardTabContent } from './BoardTabContent'
import { BoardTab } from './BoardTab'
import { usePageTitle } from '@/hooks/usePageTitle'

// ── Основная страница ──────────────────────────────────────

export default function BoardsPage() {
  usePageTitle('Доски')
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
