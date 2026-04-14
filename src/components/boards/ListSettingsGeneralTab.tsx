"use client"

/**
 * Вкладка "Основное" в диалоге настроек списка доски. Собрана из верхнего
 * блока (название/цвет/колонка/высота), выбора типа данных (task/project/inbox),
 * настроек отображения, видимых полей, сортировки и группировки.
 *
 * Вынесено из ListSettingsDialog.tsx, чтобы главный компонент не превышал
 * 400 строк (аудит 2026-04-11, Зона 6).
 */

import { useMemo } from 'react'
import {
  ArrowUpDown,
  Inbox,
  Group,
  ListChecks,
  FolderOpen,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  SORT_DIRS,
  TASK_SORT_FIELDS,
  PROJECT_SORT_FIELDS,
  TASK_GROUP_BY_OPTIONS,
  PROJECT_GROUP_BY_OPTIONS,
} from './listSettingsConfigs'
import type {
  SortField,
  SortDir,
  GroupByField,
  ListHeight,
} from './types'

interface ListSettingsGeneralTabProps {
  // Базовые поля
  name: string
  onNameChange: (value: string) => void
  headerColor: string
  onHeaderColorChange: (value: string) => void
  columnIndex: string
  onColumnIndexChange: (value: string) => void
  existingColumns: number
  listHeight: ListHeight
  onListHeightChange: (value: ListHeight) => void

  // Тип данных
  entityType: 'task' | 'project' | 'inbox'
  onEntityTypeChange: (type: 'task' | 'project' | 'inbox') => void

  // Inbox-specific
  inboxDefaultFilter: 'all' | 'unread'
  onInboxDefaultFilterChange: (value: 'all' | 'unread') => void

  // Сортировка
  sortBy: SortField
  onSortByChange: (value: SortField) => void
  sortDir: SortDir
  onSortDirChange: (value: SortDir) => void

  // Группировка
  groupBy: GroupByField
  onGroupByChange: (value: GroupByField) => void
}

export function ListSettingsGeneralTab(props: ListSettingsGeneralTabProps) {
  const {
    name,
    onNameChange,
    headerColor,
    onHeaderColorChange,
    columnIndex,
    onColumnIndexChange,
    existingColumns,
    listHeight,
    onListHeightChange,
    entityType,
    onEntityTypeChange,
    inboxDefaultFilter,
    onInboxDefaultFilterChange,
    sortBy,
    onSortByChange,
    sortDir,
    onSortDirChange,
    groupBy,
    onGroupByChange,
  } = props

  const isInbox = entityType === 'inbox'

  const sortFields = useMemo(
    () => (entityType === 'project' ? PROJECT_SORT_FIELDS : TASK_SORT_FIELDS),
    [entityType],
  )
  const groupByOptions = useMemo(
    () => (entityType === 'project' ? PROJECT_GROUP_BY_OPTIONS : TASK_GROUP_BY_OPTIONS),
    [entityType],
  )
  return (
    <div className="space-y-5">
      {/* Название + Цвет + Колонка + Высота */}
      <div className="flex gap-3">
        <div className="space-y-1.5 flex-1">
          <Label className="text-xs text-muted-foreground">Название</Label>
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="h-8 text-sm"
              placeholder="Название списка"
            />
            <label
              className="h-8 w-8 rounded-md border shrink-0 cursor-pointer transition-all hover:scale-105 relative overflow-hidden"
              style={{ backgroundColor: headerColor }}
            >
              <input
                type="color"
                value={headerColor.startsWith('#') ? headerColor : '#6B7280'}
                onChange={(e) => onHeaderColorChange(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </label>
          </div>
        </div>
        <div className="space-y-1.5 w-[120px] shrink-0">
          <Label className="text-xs text-muted-foreground">Колонка</Label>
          <Select value={columnIndex} onValueChange={onColumnIndexChange}>
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
          <Select value={listHeight} onValueChange={(v) => onListHeightChange(v as ListHeight)}>
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

      {/* Тип данных */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Тип данных</Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onEntityTypeChange('task')}
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
            onClick={() => onEntityTypeChange('project')}
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
            onClick={() => onEntityTypeChange('inbox')}
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
              onClick={() => onInboxDefaultFilterChange('all')}
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
              onClick={() => onInboxDefaultFilterChange('unread')}
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
          {/* Сортировка и группировка */}
          <div className="flex gap-4">
            {/* Сортировка */}
            <div className="space-y-2 flex-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ArrowUpDown className="h-3.5 w-3.5" />
                Сортировка
              </Label>
              <div className="flex items-center gap-2">
                <Select value={sortBy} onValueChange={(v) => onSortByChange(v as SortField)}>
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
                <Select value={sortDir} onValueChange={(v) => onSortDirChange(v as SortDir)}>
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
              <Select value={groupBy} onValueChange={(v) => onGroupByChange(v as GroupByField)}>
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
  )
}
