"use client"

/**
 * Содержимое активной вкладки ItemListsPage — собственно таблица для одного
 * item_list. Не оборачивает WorkspaceLayout и не имеет своей шапки —
 * родитель (ItemListsPage) рендерит вкладки и диалоги настроек/удаления.
 *
 * Получает уже загруженный `list` пропсом, чтобы дочерние useFilteredTasks/
 * Projects не дублировали query на детали списка.
 *
 * При смене активной вкладки родитель монтирует TabContent с key={list.id},
 * поэтому локальный selectedIds естественно сбрасывается без useEffect.
 *
 * MVP-ограничения:
 *  - Inline-смена «Проекта» треда — только через bulk action.
 */

import { useEffect, useState } from 'react'
import { useUpdateItemList, type ItemList, type ItemListColumnConfig } from '@/hooks/useItemLists'
import { defaultColumnsForEntity, getColumnDef } from './columns'
import { ThreadTableView } from './ThreadTableView'
import { ProjectTableView } from './ProjectTableView'
import type { TableShellColumn } from './TableShell'

type ItemListTabContentProps = {
  list: ItemList
  workspaceId: string
  currentUserId: string
}

export function ItemListTabContent({ list, workspaceId, currentUserId }: ItemListTabContentProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const updateList = useUpdateItemList()

  // Локальное состояние ширин — чтобы ресайз был мгновенным, без ожидания сети.
  // Синхронизируется с list при смене списка или внешнем апдейте конфига.
  const [columnConfig, setColumnConfig] = useState<ItemListColumnConfig[]>(
    () => (list.columns?.length ? list.columns : defaultColumnsForEntity(list.entity_type)),
  )
  /* eslint-disable react-hooks/set-state-in-effect -- props→state sync */
  useEffect(() => {
    setColumnConfig(list.columns?.length ? list.columns : defaultColumnsForEntity(list.entity_type))
  }, [list.id, list.columns, list.entity_type])
  /* eslint-enable react-hooks/set-state-in-effect */

  // На mouseup коммитим финальную ширину в state + БД одним апдейтом.
  // Промежуточные кадры drag не идут через React — see ColumnResizeHandle.
  const handleResizeCommit = (key: string, width: number) => {
    const next = columnConfig.map((c) => (c.key === key ? { ...c, width } : c))
    setColumnConfig(next)
    updateList.mutate({ id: list.id, workspace_id: workspaceId, columns: next })
  }

  const columns = columnConfig
    .filter((c) => c.visible)
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ ...c, def: getColumnDef(c.key) }))
    .filter((c) => c.def) as TableShellColumn[]

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {list.entity_type === 'thread' ? (
        <ThreadTableView
          workspaceId={workspaceId}
          currentUserId={currentUserId}
          filters={list.filter_config}
          sortBy={list.sort_by}
          sortDir={list.sort_dir}
          columns={columns}
          selectedIds={selectedIds}
          onSelectedChange={setSelectedIds}
          onResizeCommit={handleResizeCommit}
        />
      ) : (
        <ProjectTableView
          workspaceId={workspaceId}
          currentUserId={currentUserId}
          filters={list.filter_config}
          sortBy={list.sort_by}
          sortDir={list.sort_dir}
          columns={columns}
          selectedIds={selectedIds}
          onSelectedChange={setSelectedIds}
          onResizeCommit={handleResizeCommit}
        />
      )}
    </div>
  )
}
