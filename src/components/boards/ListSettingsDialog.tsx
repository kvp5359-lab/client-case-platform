"use client"

import { useState, useMemo } from 'react'
import { ArrowUpDown, Filter, Eye, LayoutList, LayoutGrid, Group, ListChecks, FolderOpen } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { FilterGroupEditor } from './filters/FilterGroupEditor'
import { useUpdateList } from './hooks/useListMutations'
import type { BoardList, FilterGroup, SortField, SortDir, DisplayMode, VisibleField, GroupByField } from './types'

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
}

function defaultVisibleFields(entityType: 'task' | 'project'): VisibleField[] {
  return entityType === 'project' ? ['status', 'template'] : ['status', 'deadline', 'assignees', 'project']
}

export function ListSettingsDialog({ open, onClose, list, workspaceId }: ListSettingsDialogProps) {
  const updateList = useUpdateList()
  const [name, setName] = useState(list.name)
  const [entityType, setEntityType] = useState<'task' | 'project'>(list.entity_type)
  const [filters, setFilters] = useState<FilterGroup>(list.filters)
  const [sortBy, setSortBy] = useState<SortField>(list.sort_by ?? 'created_at')
  const [sortDir, setSortDir] = useState<SortDir>(list.sort_dir ?? 'desc')
  const [displayMode, setDisplayMode] = useState<DisplayMode>(list.display_mode ?? 'list')
  const [visibleFields, setVisibleFields] = useState<VisibleField[]>(
    list.visible_fields ?? defaultVisibleFields(list.entity_type),
  )
  const [groupBy, setGroupBy] = useState<GroupByField>(list.group_by ?? 'none')

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

  const handleEntityTypeChange = (type: 'task' | 'project') => {
    setEntityType(type)
    setFilters({ logic: 'and', rules: [] })
    setVisibleFields(defaultVisibleFields(type))
    setSortBy('created_at')
    setGroupBy('none')
  }

  const handleOpenChange = (v: boolean) => {
    if (v) {
      setName(list.name)
      setEntityType(list.entity_type)
      setFilters(list.filters)
      setSortBy(list.sort_by ?? 'created_at')
      setSortDir(list.sort_dir ?? 'desc')
      setDisplayMode(list.display_mode ?? 'list')
      setVisibleFields(list.visible_fields ?? defaultVisibleFields(list.entity_type))
      setGroupBy(list.group_by ?? 'none')
    } else {
      onClose()
    }
  }

  const handleSave = () => {
    updateList.mutate(
      {
        id: list.id,
        board_id: list.board_id,
        name: name.trim() || list.name,
        entity_type: entityType,
        filters,
        sort_by: sortBy,
        sort_dir: sortDir,
        display_mode: displayMode,
        visible_fields: visibleFields,
        group_by: groupBy,
      },
      { onSuccess: onClose },
    )
  }

  const toggleField = (field: VisibleField) => {
    setVisibleFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field],
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Настройки списка</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Название */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Название</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-sm"
              placeholder="Название списка"
            />
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
            </div>
          </div>

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

          {/* Фильтры */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              Фильтры
            </Label>
            <FilterGroupEditor
              group={filters}
              onChange={setFilters}
              entityType={entityType}
              depth={0}
              workspaceId={workspaceId}
            />
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
        </div>

        <DialogFooter className="flex justify-between pt-4">
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
            }}
          >
            Сбросить
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
