"use client"

/**
 * Главный диалог настроек списка доски. Оркестрирует две вкладки —
 * "Основное" и "Фильтры" — и хранит общее состояние формы.
 *
 * После аудита 2026-04-11 (Зона 6) вкладки вынесены в отдельные файлы:
 *  - `ListSettingsGeneralTab.tsx`
 *  - `ListSettingsFiltersTab.tsx`
 *
 * Константы (список полей сортировки/группировки/видимости) лежат в
 * `listSettingsConfigs.ts` и переиспользуются во вкладке "Основное".
 */

import { useState, useEffect } from 'react'
import { Filter, Settings2 } from 'lucide-react'
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
import { ListSettingsGeneralTab } from './ListSettingsGeneralTab'
import { ListSettingsFiltersTab } from './ListSettingsFiltersTab'
import { defaultVisibleFields } from './listSettingsConfigs'
import type {
  BoardList,
  FilterGroup,
  SortField,
  SortDir,
  DisplayMode,
  VisibleField,
  GroupByField,
  ListHeight,
} from './types'

interface ListSettingsDialogProps {
  open: boolean
  onClose: () => void
  list: BoardList
  workspaceId: string
  /** Количество существующих колонок на доске */
  existingColumns?: number
}

export function ListSettingsDialog({
  open,
  onClose,
  list,
  workspaceId,
  existingColumns = 1,
}: ListSettingsDialogProps) {
  const updateList = useUpdateList()
  const [name, setName] = useState(list.name)
  const [entityType, setEntityType] = useState<'task' | 'project' | 'inbox'>(list.entity_type)
  const [columnIndex, setColumnIndex] = useState(String(list.column_index))
  const [filters, setFilters] = useState<FilterGroup>(
    list.filters?.rules ? list.filters : { logic: 'and', rules: [] },
  )
  const [sortBy, setSortBy] = useState<SortField>(list.sort_by ?? 'created_at')
  const [sortDir, setSortDir] = useState<SortDir>(list.sort_dir ?? 'desc')
  const [displayMode, setDisplayMode] = useState<DisplayMode>(list.display_mode ?? 'list')
  const [visibleFields, setVisibleFields] = useState<VisibleField[]>(
    list.visible_fields ?? defaultVisibleFields(list.entity_type),
  )
  const [groupBy, setGroupBy] = useState<GroupByField>(list.group_by ?? 'none')
  const [listHeight, setListHeight] = useState<ListHeight>(list.list_height ?? 'auto')
  const [headerColor, setHeaderColor] = useState<string>(list.header_color ?? '#6B7280')
  const [inboxDefaultFilter, setInboxDefaultFilter] = useState<'all' | 'unread'>(
    (list.filters as unknown as { default_filter?: string })?.default_filter === 'unread'
      ? 'unread'
      : 'all',
  )

  const isInbox = entityType === 'inbox'

  const handleEntityTypeChange = (type: 'task' | 'project' | 'inbox') => {
    setEntityType(type)
    setFilters({ logic: 'and', rules: [] })
    setVisibleFields(defaultVisibleFields(type))
    setSortBy('created_at')
    setGroupBy('none')
  }

  // Ресетим state при каждом открытии диалога
  useEffect(() => {
    if (open) {
      setName(list.name)
      setEntityType(list.entity_type as 'task' | 'project' | 'inbox')
      setColumnIndex(String(list.column_index))
      setFilters(list.filters?.rules ? list.filters : { logic: 'and', rules: [] })
      setSortBy(list.sort_by ?? 'created_at')
      setSortDir(list.sort_dir ?? 'desc')
      setDisplayMode(list.display_mode ?? 'list')
      setVisibleFields(list.visible_fields ?? defaultVisibleFields(list.entity_type))
      setGroupBy(list.group_by ?? 'none')
      setListHeight(list.list_height ?? 'auto')
      setHeaderColor(list.header_color ?? '#6B7280')
      setInboxDefaultFilter(
        (list.filters as unknown as { default_filter?: string })?.default_filter === 'unread'
          ? 'unread'
          : 'all',
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleOpenChange = (v: boolean) => {
    if (!v) onClose()
  }

  const handleSave = () => {
    updateList.mutate(
      {
        id: list.id,
        board_id: list.board_id,
        name: name.trim() || list.name,
        entity_type: entityType,
        column_index: parseInt(columnIndex, 10),
        filters: isInbox
          ? ({ default_filter: inboxDefaultFilter } as unknown as FilterGroup)
          : filters,
        sort_by: sortBy,
        sort_dir: sortDir,
        display_mode: displayMode,
        visible_fields: visibleFields,
        group_by: groupBy,
        list_height: listHeight,
        header_color: headerColor,
      },
      { onSuccess: onClose },
    )
  }

  const toggleField = (field: VisibleField) => {
    setVisibleFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field],
    )
  }

  const handleResetAll = () => {
    setFilters({ logic: 'and', rules: [] })
    setSortBy('created_at')
    setSortDir('desc')
    setDisplayMode('list')
    setVisibleFields(defaultVisibleFields(entityType))
    setGroupBy('none')
    setListHeight('auto')
    setHeaderColor('gray')
  }

  const filterCount = filters?.rules?.length ?? 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[680px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Настройки списка</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="shrink-0">
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
          </TabsList>

          <TabsContent value="general" className="flex-1 overflow-y-auto pr-1">
            <ListSettingsGeneralTab
              name={name}
              onNameChange={setName}
              headerColor={headerColor}
              onHeaderColorChange={setHeaderColor}
              columnIndex={columnIndex}
              onColumnIndexChange={setColumnIndex}
              existingColumns={existingColumns}
              listHeight={listHeight}
              onListHeightChange={setListHeight}
              entityType={entityType}
              onEntityTypeChange={handleEntityTypeChange}
              inboxDefaultFilter={inboxDefaultFilter}
              onInboxDefaultFilterChange={setInboxDefaultFilter}
              displayMode={displayMode}
              onDisplayModeChange={setDisplayMode}
              visibleFields={visibleFields}
              onToggleField={toggleField}
              sortBy={sortBy}
              onSortByChange={setSortBy}
              sortDir={sortDir}
              onSortDirChange={setSortDir}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
            />
          </TabsContent>

          {!isInbox && (
            <TabsContent value="filters" className="flex-1 overflow-y-auto pr-1">
              <ListSettingsFiltersTab
                filters={filters}
                onFiltersChange={setFilters}
                entityType={entityType === 'project' ? 'project' : 'task'}
                workspaceId={workspaceId}
              />
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter className="flex justify-between pt-4 shrink-0">
          <Button type="button" variant="ghost" size="sm" onClick={handleResetAll}>
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
