"use client"

/**
 * ItemListsPage — контейнер со вкладками всех списков item_lists. Полный
 * аналог BoardsPage по UX: вкладки сверху + контент активной вкладки внизу.
 *
 * Роуты:
 *   /workspaces/[id]/lists           — открывает первый по порядку список
 *   /workspaces/[id]/lists/[listId]  — открывает конкретный список
 *
 * Списков нет → empty state с кнопкой создания.
 * Запрошенный listId не найден → редирект на первый доступный (как в BoardsPage).
 */

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Plus, ListChecks } from 'lucide-react'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import { useDialog } from '@/hooks/shared/useDialog'
import { useAuth } from '@/contexts/AuthContext'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { usePageTitle } from '@/hooks/usePageTitle'
import { toast } from 'sonner'
import { useItemLists, useSoftDeleteItemList, type ItemList } from '@/hooks/useItemLists'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { usePinnedItemLists } from '@/components/WorkspaceSidebar/usePinnedItemLists'
import { CreateItemListDialog } from '@/components/itemLists/CreateItemListDialog'
import { ItemListSettingsDialog } from '@/components/itemLists/ItemListSettingsDialog'
import { ItemListTab } from './ItemListTab'
import { ItemListTabContent } from './ItemListTabContent'

export default function ItemListsPage() {
  const { workspaceId, listId: listIdFromPath } =
    useParams<{ workspaceId: string; listId?: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const closePanel = useSidePanelStore((s) => s.closePanel)
  useEffect(() => { closePanel() }, [closePanel])

  const { data: lists = [], isLoading } = useItemLists(workspaceId)
  const { isOwner, can } = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  const { isPinned: isListPinned, togglePin: toggleListPin } = usePinnedItemLists(workspaceId)
  const softDelete = useSoftDeleteItemList()

  const createDialog = useDialog()
  const settingsDialog = useDialog()

  // Резолв активной вкладки. Если в пути нет listId — используем первый.
  // Если listId не найден среди доступных — тоже падаем на первый (как в BoardsPage).
  const requestedListId = listIdFromPath ?? null
  const resolvedListId = requestedListId && lists.some((l) => l.id === requestedListId)
    ? requestedListId
    : lists[0]?.id ?? null
  const activeList = lists.find((l) => l.id === resolvedListId) ?? null

  usePageTitle(activeList?.name ?? 'Списки')

  const navigateToList = (id: string | null) => {
    if (!workspaceId) return
    const target = id
      ? `/workspaces/${workspaceId}/lists/${id}`
      : `/workspaces/${workspaceId}/lists`
    router.push(target)
  }

  // Синхронизация URL: если в пути нет listId, но есть резолвнутый список —
  // переписываем URL для шаринга.
  useEffect(() => {
    if (!workspaceId) return
    if (!resolvedListId) return
    if (listIdFromPath === resolvedListId) return
    router.replace(`/workspaces/${workspaceId}/lists/${resolvedListId}`)
  }, [workspaceId, listIdFromPath, resolvedListId, router])

  const handleDeleteList = (list: ItemList) => {
    if (!confirm(`Удалить список «${list.name}»?`)) return
    softDelete.mutate(
      { id: list.id, workspace_id: workspaceId! },
      {
        onSuccess: () => {
          toast.success('Список перемещён в корзину')
          if (resolvedListId === list.id) navigateToList(null)
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Не удалось удалить'),
      },
    )
  }

  if (!workspaceId || !user) return null

  const canPin = isOwner || can('manage_workspace_settings')

  return (
    <WorkspaceLayout>
      <div className="h-full flex flex-col bg-gray-100/60">
        {/* Заголовок страницы — показывает название активного списка
            (или общий заголовок «Списки», если ни один не выбран). */}
        <div className="px-6 pt-4 pb-2 shrink-0">
          <h1 className="text-xl font-semibold truncate flex items-center gap-2">
            {activeList ? (
              <>
                <span
                  className="h-3 w-3 rounded-full inline-block shrink-0"
                  style={{ backgroundColor: activeList.color ?? '#6B7280' }}
                />
                <span className="truncate">{activeList.name}</span>
              </>
            ) : (
              <span>Списки</span>
            )}
          </h1>
          {activeList && (
            <div className="text-xs text-muted-foreground mt-0.5 ml-5">
              {activeList.entity_type === 'thread' ? 'Треды' : 'Проекты'}
              {activeList.owner_user_id ? ' · личный' : ' · общий'}
            </div>
          )}
        </div>

        {/* Строка вкладок */}
        <div className="flex items-center px-3 py-2 shrink-0">
          <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-1 bg-muted rounded-full p-1 w-fit group/tabs">
              {isLoading ? (
                <div className="px-3 py-0.5 text-xs text-muted-foreground">Загрузка...</div>
              ) : (
                <>
                  {lists.map((list) => {
                    const canManage = list.owner_user_id === user.id || list.owner_user_id === null
                    return (
                      <ItemListTab
                        key={list.id}
                        list={list}
                        isActive={resolvedListId === list.id}
                        isPinned={isListPinned(list.id)}
                        canPin={canPin}
                        canManage={canManage}
                        onSelect={() => navigateToList(list.id)}
                        onEditSettings={() => {
                          navigateToList(list.id)
                          settingsDialog.open()
                        }}
                        onDelete={() => handleDeleteList(list)}
                        onTogglePin={() => toggleListPin(list.id)}
                      />
                    )
                  })}
                  <button
                    type="button"
                    className="p-1 rounded-full shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all opacity-0 group-hover/tabs:opacity-100"
                    onClick={createDialog.open}
                    title="Новый список"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        {!isLoading && lists.length === 0 ? (
          <EmptyState onCreate={createDialog.open} />
        ) : activeList ? (
          <ItemListTabContent
            key={activeList.id}
            list={activeList}
            workspaceId={workspaceId}
            currentUserId={user.id}
          />
        ) : null}
      </div>

      <CreateItemListDialog
        open={createDialog.isOpen}
        onClose={createDialog.close}
        workspaceId={workspaceId}
      />

      {activeList && (
        <ItemListSettingsDialog
          open={settingsDialog.isOpen}
          onClose={settingsDialog.close}
          list={activeList}
          workspaceId={workspaceId}
        />
      )}
    </WorkspaceLayout>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
      <ListChecks className="h-12 w-12 mb-3 opacity-30" />
      <p className="text-sm">Пока нет списков</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onCreate}>
        <Plus className="h-4 w-4 mr-1.5" />
        Создать первый список
      </Button>
    </div>
  )
}
