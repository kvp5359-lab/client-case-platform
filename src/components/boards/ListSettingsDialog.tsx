"use client"

import { Filter, Settings2, LayoutTemplate } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { useUpdateList } from './hooks/useListMutations'
import { useListSettingsState } from './hooks/useListSettingsState'
import { ListSettingsGeneralTab } from './ListSettingsGeneralTab'
import { ListSettingsFiltersTab } from './ListSettingsFiltersTab'
import ListSettingsAppearanceTab from './ListSettingsAppearanceTab'
import type { BoardList, FilterGroup } from './types'

interface ListSettingsDialogProps {
  open: boolean
  onClose: () => void
  list: BoardList
  workspaceId: string
  existingColumns?: number
  columnWidth?: number
}

export function ListSettingsDialog({
  open,
  onClose,
  list,
  workspaceId,
  existingColumns = 1,
  columnWidth,
}: ListSettingsDialogProps) {
  const updateList = useUpdateList()
  const { state: s, set, dispatch } = useListSettingsState(list, open)

  const isInbox = s.entityType === 'inbox'

  const handleSave = () => {
    updateList.mutate(
      {
        id: list.id,
        board_id: list.board_id,
        name: s.name.trim() || list.name,
        entity_type: s.entityType,
        column_index: parseInt(s.columnIndex, 10),
        filters: isInbox
          ? ({ default_filter: s.inboxDefaultFilter } as unknown as FilterGroup)
          : s.filters,
        sort_by: s.sortBy,
        sort_dir: s.sortDir,
        display_mode: s.displayMode,
        visible_fields: s.visibleFields,
        group_by: s.groupBy,
        list_height: s.listHeight,
        header_color: s.headerColor,
        card_layout: isInbox ? null : s.cardLayout,
      },
      { onSuccess: onClose },
    )
  }

  const filterCount = s.filters?.rules?.length ?? 0

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[680px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Настройки списка</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="shrink-0 w-fit">
            <TabsTrigger value="general" className="gap-1.5 text-xs">
              <Settings2 className="h-3.5 w-3.5" />
              Основное
            </TabsTrigger>
            {!isInbox && (
              <TabsTrigger value="filters" className="gap-1.5 text-xs">
                <Filter className="h-3.5 w-3.5" />
                Фильтры
                {filterCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                    {filterCount}
                  </span>
                )}
              </TabsTrigger>
            )}
            {!isInbox && (
              <TabsTrigger value="appearance" className="gap-1.5 text-xs">
                <LayoutTemplate className="h-3.5 w-3.5" />
                Отображение
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="general" className="flex-1 overflow-y-auto pr-1">
            <ListSettingsGeneralTab
              name={s.name}
              onNameChange={(v) => set('name', v)}
              headerColor={s.headerColor}
              onHeaderColorChange={(v) => set('headerColor', v)}
              columnIndex={s.columnIndex}
              onColumnIndexChange={(v) => set('columnIndex', v)}
              existingColumns={existingColumns}
              listHeight={s.listHeight}
              onListHeightChange={(v) => set('listHeight', v)}
              entityType={s.entityType}
              onEntityTypeChange={(t) => dispatch({ type: 'CHANGE_ENTITY_TYPE', entityType: t })}
              inboxDefaultFilter={s.inboxDefaultFilter}
              onInboxDefaultFilterChange={(v) => set('inboxDefaultFilter', v)}
              sortBy={s.sortBy}
              onSortByChange={(v) => set('sortBy', v)}
              sortDir={s.sortDir}
              onSortDirChange={(v) => set('sortDir', v)}
              groupBy={s.groupBy}
              onGroupByChange={(v) => set('groupBy', v)}
            />
          </TabsContent>

          {!isInbox && (
            <TabsContent value="filters" className="flex-1 overflow-y-auto pr-1">
              <ListSettingsFiltersTab
                filters={s.filters}
                onFiltersChange={(v) => set('filters', v)}
                entityType={s.entityType === 'project' ? 'project' : 'task'}
                workspaceId={workspaceId}
              />
            </TabsContent>
          )}

          {!isInbox && (
            <TabsContent value="appearance" className="flex-1 overflow-y-auto pr-1">
              <ListSettingsAppearanceTab
                entityType={s.entityType === 'project' ? 'project' : 'task'}
                cardLayout={s.cardLayout}
                onCardLayoutChange={(v) => set('cardLayout', v)}
                displayMode={s.displayMode}
                onDisplayModeChange={(v) => set('displayMode', v)}
                columnWidth={columnWidth}
              />
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter className="flex justify-between pt-4 shrink-0">
          <Button type="button" variant="ghost" size="sm" onClick={() => dispatch({ type: 'RESET_ALL', entityType: s.entityType })}>
            Сбросить всё
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={updateList.isPending}>
              {updateList.isPending ? 'Сохраняю...' : 'Сохранить'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
