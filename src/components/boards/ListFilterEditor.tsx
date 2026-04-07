"use client"

import { useState } from 'react'
import { ArrowUpDown } from 'lucide-react'
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
import { FilterGroupEditor } from './filters/FilterGroupEditor'
import { useUpdateList } from './hooks/useListMutations'
import type { BoardList, FilterGroup, SortField, SortDir } from './types'

const SORT_FIELDS: { value: SortField; label: string }[] = [
  { value: 'created_at', label: 'Дата создания' },
  { value: 'updated_at', label: 'Дата обновления' },
  { value: 'deadline', label: 'Дедлайн' },
  { value: 'status_order', label: 'Статус' },
  { value: 'name', label: 'Название' },
]

const SORT_DIRS: { value: SortDir; label: string }[] = [
  { value: 'asc', label: 'По возрастанию' },
  { value: 'desc', label: 'По убыванию' },
]

interface ListFilterEditorProps {
  open: boolean
  onClose: () => void
  list: BoardList
  workspaceId: string
}

export function ListFilterEditor({ open, onClose, list, workspaceId }: ListFilterEditorProps) {
  const updateList = useUpdateList()
  const [filters, setFilters] = useState<FilterGroup>(list.filters)
  const [sortBy, setSortBy] = useState<SortField>(list.sort_by ?? 'created_at')
  const [sortDir, setSortDir] = useState<SortDir>(list.sort_dir ?? 'desc')

  const handleOpenChange = (v: boolean) => {
    if (v) {
      setFilters(list.filters)
      setSortBy(list.sort_by ?? 'created_at')
      setSortDir(list.sort_dir ?? 'desc')
    } else {
      onClose()
    }
  }

  const handleSave = () => {
    updateList.mutate(
      {
        id: list.id,
        board_id: list.board_id,
        filters,
        sort_by: sortBy,
        sort_dir: sortDir,
      },
      { onSuccess: onClose },
    )
  }

  const handleClear = () => {
    setFilters({ logic: 'and', rules: [] })
    setSortBy('created_at')
    setSortDir('desc')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Фильтры — {list.name}
          </DialogTitle>
        </DialogHeader>

        <div className="py-2">
          <FilterGroupEditor
            group={filters}
            onChange={setFilters}
            entityType={list.entity_type}
            depth={0}
            workspaceId={workspaceId}
          />
        </div>

        {/* Сортировка */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground shrink-0">Сортировка</span>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_FIELDS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortDir} onValueChange={(v) => setSortDir(v as SortDir)}>
            <SelectTrigger className="h-8 text-xs w-[140px]">
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

        <DialogFooter className="flex justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
            Очистить
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
