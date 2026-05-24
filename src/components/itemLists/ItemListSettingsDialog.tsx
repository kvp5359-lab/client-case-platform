"use client"

/**
 * Диалог настроек списка item_lists. Три вкладки:
 *   1. Общее — название, цвет, сортировка.
 *   2. Фильтр — общий FilterGroupEditor.
 *   3. Колонки — какие включены, в каком порядке.
 *
 * Все изменения применяются по нажатию «Сохранить» (никаких авто-апплаев,
 * чтобы не перерисовывать таблицу при каждом клике).
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Eye, EyeOff } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FilterGroupEditor } from '@/components/filters/FilterGroupEditor'
import { useUpdateItemList, type ItemList, type ItemListColumnConfig } from '@/hooks/useItemLists'
import {
  defaultColumnsForEntity,
  getColumnDef,
  getColumnsForEntity,
  type ItemListColumnKey,
} from '@/page-components/ItemListsPage/columns'
import type { FilterGroup, SortDir, SortField } from '@/lib/filters/types'

type Props = {
  open: boolean
  onClose: () => void
  list: ItemList
  workspaceId: string
}

const SORT_DIR_OPTIONS: { value: SortDir; label: string }[] = [
  { value: 'asc', label: 'По возрастанию' },
  { value: 'desc', label: 'По убыванию' },
]

const THREAD_SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'created_at', label: 'Создано' },
  { value: 'updated_at', label: 'Обновлено' },
  { value: 'deadline', label: 'Дедлайн' },
  { value: 'name', label: 'Название' },
]

const PROJECT_SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'created_at', label: 'Создано' },
  { value: 'updated_at', label: 'Обновлено' },
  { value: 'name', label: 'Название' },
  { value: 'next_task_deadline', label: 'Ближайшая задача' },
]

export function ItemListSettingsDialog({ open, onClose, list, workspaceId }: Props) {
  const updateList = useUpdateItemList()

  const [name, setName] = useState(list.name)
  const [color, setColor] = useState(list.color ?? '#6B7280')
  const [filters, setFilters] = useState<FilterGroup>(list.filter_config)
  const [sortBy, setSortBy] = useState<SortField | ''>((list.sort_by as SortField) ?? 'created_at')
  const [sortDir, setSortDir] = useState<SortDir>((list.sort_dir as SortDir) ?? 'desc')
  const [columns, setColumns] = useState<ItemListColumnConfig[]>(
    list.columns?.length ? list.columns : defaultColumnsForEntity(list.entity_type),
  )

  // Синхронизация props → state при открытии диалога / смене list. Это
  // легитимный паттерн «инициализация формы из props» — линтер ругается,
  // но переход на key-based remount усложнит передачу из родителя.
  /* eslint-disable react-hooks/set-state-in-effect -- props→state form init */
  useEffect(() => {
    if (!open) return
    setName(list.name)
    setColor(list.color ?? '#6B7280')
    setFilters(list.filter_config)
    setSortBy((list.sort_by as SortField) ?? 'created_at')
    setSortDir((list.sort_dir as SortDir) ?? 'desc')
    setColumns(list.columns?.length ? list.columns : defaultColumnsForEntity(list.entity_type))
  }, [open, list])
  /* eslint-enable react-hooks/set-state-in-effect */

  const sortOptions = list.entity_type === 'project' ? PROJECT_SORT_OPTIONS : THREAD_SORT_OPTIONS

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Название не может быть пустым')
      return
    }
    updateList.mutate(
      {
        id: list.id,
        workspace_id: workspaceId,
        name: name.trim(),
        color,
        filter_config: filters,
        sort_by: (sortBy || null) as SortField | null,
        sort_dir: sortDir,
        columns,
      },
      {
        onSuccess: () => {
          toast.success('Настройки сохранены')
          onClose()
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Не удалось сохранить'),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Настройки списка</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="general">Общее</TabsTrigger>
            <TabsTrigger value="filters">Фильтр</TabsTrigger>
            <TabsTrigger value="columns">Колонки</TabsTrigger>
          </TabsList>

          {/* Общее */}
          <TabsContent value="general" className="space-y-4 pt-4 overflow-y-auto">
            <div className="space-y-2">
              <Label>Название</Label>
              <div className="flex gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
                <label
                  className="h-9 w-9 rounded-md border shrink-0 cursor-pointer relative overflow-hidden"
                  style={{ backgroundColor: color }}
                >
                  <input
                    type="color"
                    value={color.startsWith('#') ? color : '#6B7280'}
                    onChange={(e) => setColor(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Сортировать по</Label>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sortOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Направление</Label>
                <Select value={sortDir} onValueChange={(v) => setSortDir(v as SortDir)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SORT_DIR_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          {/* Фильтр */}
          <TabsContent value="filters" className="pt-4 overflow-y-auto">
            <p className="text-xs text-muted-foreground mb-3">
              Условия применяются к {list.entity_type === 'thread' ? 'тредам' : 'проектам'} воркспейса.
              Если в фильтре указать тип треда (task/chat/email) — список доступных полей сузится.
            </p>
            <FilterGroupEditor
              group={filters}
              onChange={setFilters}
              entityType={list.entity_type}
              depth={0}
              workspaceId={workspaceId}
            />
          </TabsContent>

          {/* Колонки */}
          <TabsContent value="columns" className="pt-4 overflow-y-auto space-y-2">
            <p className="text-xs text-muted-foreground">
              Какие колонки показывать в таблице. Перемещайте стрелками, скрывайте кликом по «глазу».
            </p>
            <ColumnsEditor
              columns={columns}
              onChange={setColumns}
              availableEntity={list.entity_type}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="border-t pt-3">
          <Button variant="ghost" onClick={onClose} disabled={updateList.isPending}>Отмена</Button>
          <Button onClick={handleSave} disabled={updateList.isPending}>
            {updateList.isPending ? 'Сохраняю…' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Редактор колонок ──────────────────────────────────────

function ColumnsEditor({
  columns,
  onChange,
  availableEntity,
}: {
  columns: ItemListColumnConfig[]
  onChange: (next: ItemListColumnConfig[]) => void
  availableEntity: 'thread' | 'project'
}) {
  const allDefs = getColumnsForEntity(availableEntity)

  // Объединение: все определения + текущая конфигурация (с приоритетом
  // конфига для порядка/видимости/ширины).
  const merged = allDefs.map((def) => {
    const cfg = columns.find((c) => c.key === def.key)
    return {
      def,
      cfg: cfg ?? {
        key: def.key as ItemListColumnKey,
        width: def.defaultWidth,
        order: 9999, // не настроена → в конец
        visible: false,
      },
    }
  })

  // Сортировка: видимые сверху по order, скрытые снизу.
  const sorted = [...merged].sort((a, b) => {
    if (a.cfg.visible !== b.cfg.visible) return a.cfg.visible ? -1 : 1
    return a.cfg.order - b.cfg.order
  })

  const updateColumn = (key: string, patch: Partial<ItemListColumnConfig>) => {
    const existing = columns.find((c) => c.key === key)
    if (existing) {
      onChange(columns.map((c) => (c.key === key ? { ...c, ...patch } : c)))
    } else {
      const def = getColumnDef(key)!
      onChange([
        ...columns,
        {
          key: key as ItemListColumnKey,
          width: def.defaultWidth,
          order: columns.length,
          visible: true,
          ...patch,
        },
      ])
    }
  }

  const move = (key: string, dir: -1 | 1) => {
    const visible = columns.filter((c) => c.visible).sort((a, b) => a.order - b.order)
    const idx = visible.findIndex((c) => c.key === key)
    if (idx === -1) return
    const swapWith = idx + dir
    if (swapWith < 0 || swapWith >= visible.length) return
    const a = visible[idx]
    const b = visible[swapWith]
    onChange(
      columns.map((c) => {
        if (c.key === a.key) return { ...c, order: b.order }
        if (c.key === b.key) return { ...c, order: a.order }
        return c
      }),
    )
  }

  return (
    <div className="space-y-1">
      {sorted.map(({ def, cfg }) => (
        <div
          key={def.key}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/40"
        >
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground p-1"
            disabled={!cfg.visible || def.required}
            onClick={() => move(def.key, -1)}
            title="Выше"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground p-1"
            disabled={!cfg.visible || def.required}
            onClick={() => move(def.key, 1)}
            title="Ниже"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <span className="text-sm flex-1">{def.label}</span>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={cfg.width}
              min={def.minWidth}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (!Number.isFinite(v)) return
                updateColumn(def.key, { width: Math.max(def.minWidth, v) })
              }}
              className="h-7 w-20 text-xs"
            />
            <span className="text-xs text-muted-foreground">px</span>
          </div>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground p-1 disabled:opacity-30"
            disabled={def.required}
            onClick={() => updateColumn(def.key, { visible: !cfg.visible })}
            title={cfg.visible ? 'Скрыть' : 'Показать'}
          >
            {cfg.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
        </div>
      ))}
    </div>
  )
}
