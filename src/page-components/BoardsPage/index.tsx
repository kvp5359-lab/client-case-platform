"use client"

/**
 * BoardsPage — единый раздел «Доски и списки». В одном таб-баре соседствуют
 * доски (boards, с колонками) и списки (item_lists, табличное представление).
 * Раздел /lists упразднён и редиректит сюда.
 *
 * Роутинг (префикс только у списков, доски сохраняют прежние URL для
 * short_id/шаринга):
 *   /workspaces/[id]/boards               — первая вкладка (доска или список)
 *   /workspaces/[id]/boards/<uuid|short>  — доска
 *   /workspaces/[id]/boards/list-<uuid>   — список
 *
 * Порядок вкладок (MVP): сначала доски, потом списки. Драг-реордер смешанных
 * вкладок — отдельной задачей (нужно общее поле порядка в БД).
 */

import { useEffect, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Plus, Kanban, ListChecks, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDialog } from '@/hooks/shared/useDialog'
import { useAuth } from '@/contexts/AuthContext'
import { useBoardsQuery } from '@/components/boards/hooks/useBoardsQuery'
import { useDeleteBoard } from '@/components/boards/hooks/useBoardMutations'
import { CreateBoardDialog } from '@/components/boards/CreateBoardDialog'
import { EditBoardDialog } from '@/components/boards/EditBoardDialog'
import { BoardFilterDialog } from '@/components/boards/BoardFilterDialog'
import { CreateFunnelDialog } from '@/components/boards/CreateFunnelDialog'
import { useBoardLists } from '@/components/boards/hooks/useBoardQuery'
import { normalizeBoardGlobalFilter } from '@/components/boards/types'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { usePinnedBoards } from '@/components/WorkspaceSidebar/usePinnedBoards'
import { usePinnedItemLists } from '@/components/WorkspaceSidebar/usePinnedItemLists'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { useItemLists, useSoftDeleteItemList, type ItemList } from '@/hooks/useItemLists'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useSections, useSectionMaps } from '@/hooks/useSections'
import { CreateItemListDialog } from '@/components/itemLists/CreateItemListDialog'
import { ItemListSettingsDialog } from '@/components/itemLists/ItemListSettingsDialog'
import type { Board } from '@/components/boards/types'
import { BoardTabContent } from './BoardTabContent'
import { BoardTab } from './BoardTab'
import { ItemListTab } from '@/page-components/ItemListsPage/ItemListTab'
import { ItemListTabContent } from '@/page-components/ItemListsPage/ItemListTabContent'
import { usePageTitle } from '@/hooks/usePageTitle'

const LIST_PREFIX = 'list-'

// ── Основная страница ──────────────────────────────────────

export default function BoardsPage() {
  const { workspaceId, boardId: tabParam } = useParams<{ workspaceId: string; boardId?: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const closePanel = useSidePanelStore((s) => s.closePanel)
  const createBoardDialog = useDialog()
  const editDialog = useDialog()
  const filterDialog = useDialog()
  const funnelDialog = useDialog()
  const createListColumnDialog = useDialog() // колонка внутри доски (board_list)
  const createItemListDialog = useDialog()   // новый item_list
  const settingsListDialog = useDialog()     // настройки item_list

  const { data: allBoards, isLoading: boardsLoading } = useBoardsQuery(workspaceId)
  const { data: allItemLists = [], isLoading: listsLoading } = useItemLists(workspaceId)
  const { data: sections = [] } = useSections(workspaceId)
  const { bySection } = useSectionMaps(workspaceId)

  // Активный раздел сужает таб-бар до своих членов (?section=<id>). Без него —
  // показываем все доски и списки воркспейса.
  const sectionId = searchParams.get('section')
  const activeSection = sectionId ? sections.find((s) => s.id === sectionId) ?? null : null
  const sectionMemberKeys = useMemo(() => {
    if (!sectionId) return null
    return new Set((bySection.get(sectionId) ?? []).map((i) => `${i.item_type}:${i.item_id}`))
  }, [sectionId, bySection])
  const boards = useMemo(
    () => (sectionMemberKeys ? (allBoards ?? []).filter((b) => sectionMemberKeys.has(`board:${b.id}`)) : allBoards),
    [allBoards, sectionMemberKeys],
  )
  const itemLists = useMemo(
    () => (sectionMemberKeys ? allItemLists.filter((l) => sectionMemberKeys.has(`list:${l.id}`)) : allItemLists),
    [allItemLists, sectionMemberKeys],
  )
  const deleteBoard = useDeleteBoard()
  const softDeleteList = useSoftDeleteItemList()
  const { isPinned: isBoardPinned, togglePin: toggleBoardPin } = usePinnedBoards(workspaceId)
  const { isPinned: isListPinned, togglePin: toggleListPin } = usePinnedItemLists(workspaceId)
  const { isOwner, can } = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  const canManageShared = isOwner || can('manage_workspace_settings')
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const isLoading = boardsLoading || listsLoading

  // Закрываем боковую панель при входе на страницу.
  useEffect(() => { closePanel() }, [closePanel])

  // ── Разбор активной вкладки из роута ──
  // Доски — голый uuid/short_id; списки — с префиксом list-.
  const legacyBoardFromQuery = searchParams.get('board')
  const rawParam = tabParam ?? legacyBoardFromQuery ?? null
  const requestedKind: 'board' | 'list' = rawParam?.startsWith(LIST_PREFIX) ? 'list' : 'board'
  const requestedId = rawParam?.startsWith(LIST_PREFIX) ? rawParam.slice(LIST_PREFIX.length) : rawParam

  // Резолв активной вкладки: запрошенная (если существует), иначе первая доска,
  // иначе первый список.
  const requestedListMatch =
    requestedKind === 'list' && requestedId ? itemLists.find((l) => l.id === requestedId) ?? null : null
  const requestedBoardMatch =
    requestedKind === 'board' && requestedId ? boards?.find((b) => b.id === requestedId) ?? null : null

  const activeBoard: Board | null =
    requestedBoardMatch ?? (requestedListMatch ? null : boards?.[0] ?? null)
  const activeList: ItemList | null =
    requestedListMatch ?? (activeBoard ? null : itemLists[0] ?? null)

  usePageTitle(activeBoard?.name ?? activeList?.name ?? 'Доски и списки')

  // Списки активной доски — сколько колонок занято (для воронки).
  const { data: activeBoardLists } = useBoardLists(activeBoard?.id)
  const existingColumnsCount = activeBoardLists
    ? Math.max(0, ...activeBoardLists.map((l) => l.column_index + 1))
    : 0

  // Навигация сохраняет активный раздел (?section), чтобы переключение вкладок
  // не «выбрасывало» из раздела.
  const sectionQS = sectionId ? `?section=${sectionId}` : ''
  const navigateToBoard = (id: string | null) => {
    if (!workspaceId) return
    router.push(id ? `/workspaces/${workspaceId}/boards/${id}${sectionQS}` : `/workspaces/${workspaceId}/boards${sectionQS}`)
  }
  const navigateToList = (id: string) => {
    if (!workspaceId) return
    router.push(`/workspaces/${workspaceId}/boards/${LIST_PREFIX}${id}${sectionQS}`)
  }

  // Синхронизация URL: если путь не совпадает с резолвнутой вкладкой — переписываем,
  // чтобы URL был полным и шарабельным (legacy ?board=, дефолтная первая вкладка).
  useEffect(() => {
    if (!workspaceId || isLoading) return
    const base = activeBoard
      ? `/workspaces/${workspaceId}/boards/${activeBoard.id}`
      : activeList
        ? `/workspaces/${workspaceId}/boards/${LIST_PREFIX}${activeList.id}`
        : null
    if (!base) return
    const desired = base + sectionQS
    const current = `/workspaces/${workspaceId}/boards/${tabParam ?? ''}`.replace(/\/$/, '') + sectionQS
    if (current !== desired) router.replace(desired)
  }, [workspaceId, isLoading, tabParam, activeBoard, activeList, router, sectionQS])

  const handleDeleteBoard = async (board: Board) => {
    const ok = await confirm({
      title: 'Удалить доску?',
      description: `Доска «${board.name}» и все её списки будут удалены.`,
      variant: 'destructive',
    })
    if (!ok) return
    deleteBoard.mutate(
      { id: board.id, workspace_id: workspaceId! },
      { onSuccess: () => { if (activeBoard?.id === board.id) navigateToBoard(null) } },
    )
  }

  const handleDeleteList = async (list: ItemList) => {
    const ok = await confirm({
      title: 'Удалить список?',
      description: `Список «${list.name}» будет перемещён в корзину.`,
      variant: 'destructive',
    })
    if (!ok) return
    softDeleteList.mutate(
      { id: list.id, workspace_id: workspaceId! },
      {
        onSuccess: () => {
          toast.success('Список перемещён в корзину')
          if (activeList?.id === list.id) navigateToBoard(null)
        },
        onError: (e) => toast.error(getUserFacingErrorMessage(e, 'Не удалось удалить')),
      },
    )
  }

  if (!workspaceId || !user) return null

  const isEmpty = !isLoading && (boards?.length ?? 0) === 0 && itemLists.length === 0

  return (
    <WorkspaceLayout>
      <div className="h-full flex flex-col bg-gray-100/60">
        {/* Шапка активного раздела */}
        {activeSection && (
          <div className="flex items-center gap-2 px-4 pt-3 pb-1 shrink-0">
            <span className="text-sm font-semibold">{activeSection.name}</span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => router.push(`/workspaces/${workspaceId}/boards`)}
            >
              × Все
            </button>
          </div>
        )}

        {/* Строка вкладок */}
        <div className="flex items-center px-3 py-2 shrink-0">
          <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none scroll-fade-right">
            <div className="flex items-center gap-1 bg-muted rounded-full p-1 w-fit group/tabs">
              {isLoading ? (
                <div className="px-3 py-0.5 text-xs text-muted-foreground">Загрузка...</div>
              ) : (
                <>
                  {boards?.map((board) => (
                    <BoardTab
                      key={board.id}
                      board={board}
                      isActive={activeBoard?.id === board.id}
                      isPinned={isBoardPinned(board.id)}
                      canPin={isOwner}
                      hasBoardFilter={(() => {
                        const f = normalizeBoardGlobalFilter(board.global_filter)
                        return f.project.rules.length > 0 || f.thread.rules.length > 0
                      })()}
                      workspaceId={workspaceId}
                      canManageSections={canManageShared}
                      onSelect={() => navigateToBoard(board.id)}
                      onEdit={() => { navigateToBoard(board.id); editDialog.open() }}
                      onEditFilter={() => { navigateToBoard(board.id); filterDialog.open() }}
                      onCreateFunnel={() => { navigateToBoard(board.id); funnelDialog.open() }}
                      onDelete={() => handleDeleteBoard(board)}
                      onAddList={() => { navigateToBoard(board.id); createListColumnDialog.open() }}
                      onTogglePin={() => toggleBoardPin(board.id)}
                    />
                  ))}
                  {itemLists.map((list) => {
                    const canManage = list.owner_user_id === user.id || list.owner_user_id === null
                    return (
                      <ItemListTab
                        key={list.id}
                        list={list}
                        isActive={activeList?.id === list.id}
                        isPinned={isListPinned(list.id)}
                        canPin={canManageShared}
                        canManage={canManage}
                        workspaceId={workspaceId}
                        canManageSections={canManageShared}
                        onSelect={() => navigateToList(list.id)}
                        onEditSettings={() => { navigateToList(list.id); settingsListDialog.open() }}
                        onDelete={() => handleDeleteList(list)}
                        onTogglePin={() => toggleListPin(list.id)}
                      />
                    )
                  })}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="p-1 rounded-full shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all opacity-100 md:opacity-0 md:group-hover/tabs:opacity-100"
                        title="Добавить"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={createBoardDialog.open}>
                        <Kanban className="h-3.5 w-3.5 mr-2" /> Новая доска
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={createItemListDialog.open}>
                        <ListChecks className="h-3.5 w-3.5 mr-2" /> Новый список
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-3">
            <Kanban className="h-12 w-12 opacity-30" />
            {activeSection ? (
              <p className="text-sm max-w-xs text-center">
                В этом разделе пока нет досок и списков. Добавьте их через меню «⋯» доски или
                списка → «Разделы…».
              </p>
            ) : (
              <>
                <p className="text-sm">Пока нет досок и списков</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={createBoardDialog.open}>
                    <Kanban className="h-4 w-4 mr-1.5" /> Доска
                  </Button>
                  <Button variant="outline" size="sm" onClick={createItemListDialog.open}>
                    <FolderOpen className="h-4 w-4 mr-1.5" /> Список
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : activeBoard ? (
          <BoardTabContent
            key={activeBoard.id}
            board={activeBoard}
            workspaceId={workspaceId}
            createListDialog={createListColumnDialog}
          />
        ) : activeList ? (
          <ItemListTabContent
            key={activeList.id}
            list={activeList}
            workspaceId={workspaceId}
            currentUserId={user.id}
          />
        ) : null}
      </div>

      <CreateBoardDialog
        open={createBoardDialog.isOpen}
        onClose={createBoardDialog.close}
        workspaceId={workspaceId}
      />
      <CreateItemListDialog
        open={createItemListDialog.isOpen}
        onClose={createItemListDialog.close}
        workspaceId={workspaceId}
      />

      {activeBoard && (
        <EditBoardDialog open={editDialog.isOpen} onClose={editDialog.close} board={activeBoard} />
      )}
      {activeBoard && (
        <BoardFilterDialog open={filterDialog.isOpen} onClose={filterDialog.close} board={activeBoard} />
      )}
      {activeBoard && (
        <CreateFunnelDialog
          open={funnelDialog.isOpen}
          onClose={funnelDialog.close}
          workspaceId={workspaceId}
          boardId={activeBoard.id}
          existingColumnsCount={existingColumnsCount}
        />
      )}
      {activeList && (
        <ItemListSettingsDialog
          open={settingsListDialog.isOpen}
          onClose={settingsListDialog.close}
          list={activeList}
          workspaceId={workspaceId}
        />
      )}

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </WorkspaceLayout>
  )
}
