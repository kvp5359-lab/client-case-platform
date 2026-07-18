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

import { useEffect, useMemo, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Plus, Kanban, ListChecks, FolderOpen, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
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
import { Skeleton } from '@/components/ui/skeleton'
import { useSections, useSectionMaps } from '@/hooks/useSections'
import { CreateItemListDialog } from '@/components/itemLists/CreateItemListDialog'
import { ItemListSettingsDialog } from '@/components/itemLists/ItemListSettingsDialog'
import type { Board } from '@/components/boards/types'
import { BoardTabContent } from './BoardTabContent'
import { BoardTab } from './BoardTab'
import { ItemListTab } from '@/page-components/ItemListsPage/ItemListTab'
import { ItemListTabContent } from '@/page-components/ItemListsPage/ItemListTabContent'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useScrollActiveTabIntoView } from '@/hooks/useScrollActiveTabIntoView'

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

  // Overlay-режим правой панели: доски — единственное исключение из push по
  // умолчанию. Панель ложится ПОВЕРХ доски, main не сужается — доскам нужна
  // полная ширина и горизонтальный скролл колонок. Атрибут читает CSS.
  useEffect(() => {
    document.body.setAttribute('data-panel-mode', 'overlay')
    return () => document.body.removeAttribute('data-panel-mode')
  }, [])

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

  // Вкладки досок и списков — единый ряд, листается горизонтально (свайп/скролл
  // без видимого ползунка), справа всегда кнопка-«бутерброд» со всеми вкладками.
  const tabItems = useMemo(
    () => [
      ...(boards ?? []).map((b) => ({ id: `board:${b.id}`, kind: 'board' as const, board: b })),
      ...itemLists.map((l) => ({ id: `list:${l.id}`, kind: 'list' as const, list: l })),
    ],
    [boards, itemLists],
  )
  const activeTabId = activeBoard
    ? `board:${activeBoard.id}`
    : activeList
      ? `list:${activeList.id}`
      : null
  const tabsScrollRef = useRef<HTMLDivElement>(null)
  useScrollActiveTabIntoView(tabsScrollRef, activeTabId)

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

        {/* Строка вкладок — листается горизонтально, справа всегда бутерброд. */}
        <div className="flex items-center px-3 py-2 shrink-0">
          <div className="relative flex-1 min-w-0 flex items-center gap-2 group/tabs">
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1 min-w-0 max-w-full">
              {isLoading ? (
                <div className="flex items-center gap-1">
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              ) : (
                <>
                  {/* Скроллящийся ряд вкладок (ползунок скрыт). py/-my — припуск,
                      чтобы overflow не подрезал тень активной вкладки. */}
                  <div
                    ref={tabsScrollRef}
                    className="flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-hide py-0.5 -my-0.5"
                  >
                    {tabItems.map((it) => (
                      <div key={it.id} data-tab-id={it.id} className="shrink-0">
                        {it.kind === 'board' ? (
                          <BoardTab
                            board={it.board}
                            isActive={activeBoard?.id === it.board.id}
                            isPinned={isBoardPinned(it.board.id)}
                            canPin={isOwner}
                            hasBoardFilter={(() => {
                              const f = normalizeBoardGlobalFilter(it.board.global_filter)
                              return f.project.rules.length > 0 || f.thread.rules.length > 0
                            })()}
                            workspaceId={workspaceId}
                            canManageSections={canManageShared}
                            onSelect={() => navigateToBoard(it.board.id)}
                            onEdit={() => { navigateToBoard(it.board.id); editDialog.open() }}
                            onEditFilter={() => { navigateToBoard(it.board.id); filterDialog.open() }}
                            onCreateFunnel={() => { navigateToBoard(it.board.id); funnelDialog.open() }}
                            onDelete={() => handleDeleteBoard(it.board)}
                            onAddList={() => { navigateToBoard(it.board.id); createListColumnDialog.open() }}
                            onTogglePin={() => toggleBoardPin(it.board.id)}
                          />
                        ) : (
                          <ItemListTab
                            list={it.list}
                            isActive={activeList?.id === it.list.id}
                            isPinned={isListPinned(it.list.id)}
                            canPin={canManageShared}
                            canManage={it.list.owner_user_id === user.id || it.list.owner_user_id === null}
                            workspaceId={workspaceId}
                            canManageSections={canManageShared}
                            onSelect={() => navigateToList(it.list.id)}
                            onEditSettings={() => { navigateToList(it.list.id); settingsListDialog.open() }}
                            onDelete={() => handleDeleteList(it.list)}
                            onTogglePin={() => toggleListPin(it.list.id)}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Бутерброд — всегда справа, вне скролла. В меню — ВСЕ вкладки. */}
                  {tabItems.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          title="Все вкладки"
                          aria-label="Все вкладки"
                          className="ml-0.5 shrink-0 h-7 w-8 flex items-center justify-center rounded-md bg-background shadow text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Menu className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-[70vh] overflow-y-auto">
                        {tabItems.map((it) => (
                          <DropdownMenuItem
                            key={it.id}
                            onClick={() =>
                              it.kind === 'board'
                                ? navigateToBoard(it.board.id)
                                : navigateToList(it.list.id)
                            }
                            className={cn(activeTabId === it.id && 'bg-accent text-accent-foreground')}
                          >
                            {it.kind === 'board' ? (
                              <Kanban className="h-3.5 w-3.5 mr-2" />
                            ) : (
                              <ListChecks className="h-3.5 w-3.5 mr-2" />
                            )}
                            {it.kind === 'board' ? it.board.name : it.list.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </>
              )}
            </div>

            {/* «+» — ВНЕ серой плашки: плашка заканчивается на бутерброде, а
                кнопка добавления появляется отдельно по наведению на ряд. */}
            {!isLoading && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="p-1 rounded-md shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted transition-all opacity-100 md:opacity-0 md:group-hover/tabs:opacity-100"
                    title="Добавить"
                  >
                    <Plus className="h-4 w-4" />
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
            )}
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
