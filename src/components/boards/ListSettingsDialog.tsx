"use client"

import { useState, useMemo, useEffect } from 'react'
import { ArrowUpDown, Filter, Eye, Inbox, LayoutList, LayoutGrid, Group, ListChecks, FolderOpen, Settings2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { FilterGroupEditor } from './filters/FilterGroupEditor'
import { useUpdateList } from './hooks/useListMutations'
import type { BoardList, FilterGroup, SortField, SortDir, DisplayMode, VisibleField, GroupByField, ListHeight } from './types'

const SORT_DIRS: { value: SortDir; label: string }[] = [
  { value: 'asc', label: 'По возрастанию' },
  { value: 'desc', label: 'По убыванию' },
]

// ── Конфигурации по entity_type ──────────────────────────

const TASK_SORT_FIELDS: { value: SortField; label: string }[] = [
  { value: 'created_at', label: 'Дата создания' },
  { value: 'updated_at', label: 'Дата обновления' },
  { value: 'deadline', label: 'Дедлайн' },
  { value: 'status_order', label: 'Статус' },
  { value: 'name', label: 'Название' },
]

const PROJECT_SORT_FIELDS: { value: SortField; label: string }[] = [
  { value: 'created_at', label: 'Дата создания' },
  { value: 'updated_at', label: 'Дата обновления' },
  { value: 'name', label: 'Название' },
]

const TASK_GROUP_BY_OPTIONS: { value: GroupByField; label: string }[] = [
  { value: 'none', label: 'Без группировки' },
  { value: 'status', label: 'Статус' },
  { value: 'project', label: 'Проект' },
  { value: 'assignee', label: 'Исполнитель' },
  { value: 'deadline', label: 'Дедлайн' },
]

const PROJECT_GROUP_BY_OPTIONS: { value: GroupByField; label: string }[] = [
  { value: 'none', label: 'Без группировки' },
  { value: 'status', label: 'Статус' },
]

const TASK_VISIBLE_FIELDS: { value: VisibleField; label: string }[] = [
  { value: 'status', label: 'Статус' },
  { value: 'deadline', label: 'Дедлайн' },
  { value: 'assignees', label: 'Исполнители' },
  { value: 'project', label: 'Проект' },
]

const PROJECT_VISIBLE_FIELDS: { value: VisibleField; label: string }[] = [
  { value: 'status', label: 'Статус' },
  { value: 'template', label: 'Шаблон' },
]

interface ListSettingsDialogProps {
  open: boolean
  onClose: () => void
  list: BoardList
  workspaceId: string
  /** Количество существующих колонок на доске */
  existingColumns?: number
}

function defaultVisibleFields(entityType: 'task' | 'project' | 'inbox'): VisibleField[] {
  if (entityType === 'inbox') return []
  return entityType === 'project' ? ['status', 'template'] : ['status', 'deadline', 'assignees', 'project']
}

export function ListSettingsDialog({ open, onClose, list, workspaceId, existingColumns = 1 }: ListSettingsDialogProps) {
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
    (list.filters as unknown as { default_filter?: string })?.default_filter === 'unread' ? 'unread' : 'all',
  )

  const sortFields = useMemo(
    () => (entityType === 'project' ? PROJECT_SORT_FIELDS : TASK_SORT_FIELDS),
    [entityType],
  )
  const groupByOptions = useMemo(
    () => (entityType === 'project' ? PROJECT_GROUP_BY_OPTIONS : TASK_GROUP_BY_OPTIONS),
    [entityType],
  )
  const visibleFieldOptions = useMemo(
    () => (entityType === 'project' ? PROJECT_VISIBLE_FIELDS : TASK_VISIBLE_FIELDS),
    [entityType],
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
        (list.filters as unknown as { default_filter?: string })?.default_filter === 'unread' ? 'unread' : 'all',
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
        filters: isInbox ? { default_filter: inboxDefaultFilter } as unknown as FilterGroup : filters,
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

          {/* ── Вкладка: Основное ── */}
          <TabsContent value="general" className="flex-1 overflow-y-auto pr-1">
            <div className="space-y-5">
              {/* Название + Цвет + Колонка + Высота */}
              <div className="flex gap-3">
                <div className="space-y-1.5 flex-1">
                  <Label className="text-xs text-muted-foreground">Название</Label>
                  <div className="flex gap-2">
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-8 text-sm"
                      placeholder="Название списка"
                    />
                    <label className="h-8 w-8 rounded-md border shrink-0 cursor-pointer transition-all hover:scale-105 relative overflow-hidden" style={{ backgroundColor: headerColor }}>
                      <input
                        type="color"
                        value={headerColor.startsWith('#') ? headerColor : '#6B7280'}
                        onChange={(e) => setHeaderColor(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                    </label>
                  </div>
                </div>
                <div className="space-y-1.5 w-[120px] shrink-0">
                  <Label className="text-xs text-muted-foreground">Колонка</Label>
                  <Select value={columnIndex} onValueChange={setColumnIndex}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: existingColumns + 1 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {i < existingColumns ? `Колонка ${i + 1}` : `Новая (${i + 1})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 w-[120px] shrink-0">
                  <Label className="text-xs text-muted-foreground">Высота</Label>
                  <Select value={listHeight} onValueChange={(v) => setListHeight(v as ListHeight)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Авто</SelectItem>
                      <SelectItem value="medium">Средняя</SelectItem>
                      <SelectItem value="full">Вся страница</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Тип: задачи / проекты */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Тип данных</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleEntityTypeChange('task')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border transition-colors',
                      entityType === 'task'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <ListChecks className="h-3.5 w-3.5" />
                    Задачи
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEntityTypeChange('project')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border transition-colors',
                      entityType === 'project'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Проекты
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEntityTypeChange('inbox')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border transition-colors',
                      entityType === 'inbox'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Inbox className="h-3.5 w-3.5" />
                    Входящие
                  </button>
                </div>
              </div>

              {/* Настройки для Входящих */}
              {isInbox && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Показывать по умолчанию</Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setInboxDefaultFilter('all')}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs border transition-colors',
                        inboxDefaultFilter === 'all'
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground',
                      )}
                    >
                      Все
                    </button>
                    <button
                      type="button"
                      onClick={() => setInboxDefaultFilter('unread')}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs border transition-colors',
                        inboxDefaultFilter === 'unread'
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground',
                      )}
                    >
                      Непрочитанные
                    </button>
                  </div>
                </div>
              )}

              {/* Настройки ниже скрыты для типа «Входящие» */}
              {!isInbox && (
                <>
                  {/* Отображение */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <LayoutList className="h-3.5 w-3.5" />
                      Отображение
                    </Label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDisplayMode('list')}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border transition-colors',
                          displayMode === 'list'
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <LayoutList className="h-3.5 w-3.5" />
                        Список
                      </button>
                      <button
                        type="button"
                        onClick={() => setDisplayMode('cards')}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border transition-colors',
                          displayMode === 'cards'
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <LayoutGrid className="h-3.5 w-3.5" />
                        Карточки
                      </button>
                    </div>
                  </div>

                  {/* Видимые поля */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5" />
                      Что отображать
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {visibleFieldOptions.map((opt) => {
                        const active = visibleFields.includes(opt.value)
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => toggleField(opt.value)}
                            className={cn(
                              'px-2.5 py-1 rounded-full text-xs border transition-colors',
                              active
                                ? 'border-primary bg-primary/5 text-primary'
                                : 'border-border text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Сортировка и группировка */}
                  <div className="flex gap-4">
                    {/* Сортировка */}
                    <div className="space-y-2 flex-1">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <ArrowUpDown className="h-3.5 w-3.5" />
                        Сортировка
                      </Label>
                      <div className="flex items-center gap-2">
                        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {sortFields.map((f) => (
                              <SelectItem key={f.value} value={f.value}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={sortDir} onValueChange={(v) => setSortDir(v as SortDir)}>
                          <SelectTrigger className="h-8 text-xs w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SORT_DIRS.map((d) => (
                              <SelectItem key={d.value} value={d.value}>
                                {d.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Группировка */}
                    <div className="space-y-2 flex-1">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Group className="h-3.5 w-3.5" />
                        Группировка
                      </Label>
                      <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupByField)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {groupByOptions.map((g) => (
                            <SelectItem key={g.value} value={g.value}>
                              {g.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {/* ── Вкладка: Фильтры ── */}
          {!isInbox && (
            <TabsContent value="filters" className="flex-1 overflow-y-auto pr-1">
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Настройте условия фильтрации. Условия внутри группы объединяются логикой И или ИЛИ. Вы можете создавать вложенные группы и перетаскивать условия между группами.
                </p>
                <FilterGroupEditor
                  group={filters}
                  onChange={setFilters}
                  entityType={entityType === 'project' ? 'project' : 'task'}
                  depth={0}
                  workspaceId={workspaceId}
                />

                {filters.rules.length > 0 && (
                  <div className="pt-2 border-t">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      onClick={() => setFilters({ logic: 'and', rules: [] })}
                    >
                      Очистить все фильтры
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter className="flex justify-between pt-4 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters({ logic: 'and', rules: [] })
              setSortBy('created_at')
              setSortDir('desc')
              setDisplayMode('list')
              setVisibleFields(defaultVisibleFields(entityType))
              setGroupBy('none')
              setListHeight('auto')
              setHeaderColor('gray')
            }}
          >
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
