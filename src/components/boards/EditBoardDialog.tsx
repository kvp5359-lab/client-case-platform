"use client"

import { useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { useUpdateBoard, useDeleteBoard } from './hooks/useBoardMutations'
import { useBoardLists } from './hooks/useBoardQuery'
import { DEFAULT_COLUMN_WIDTH, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH, type Board } from './types'

interface EditBoardDialogProps {
  open: boolean
  onClose: () => void
  board: Board
}

export function EditBoardDialog({ open, onClose, board }: EditBoardDialogProps) {
  const updateBoard = useUpdateBoard()
  const deleteBoard = useDeleteBoard()
  const { data: lists } = useBoardLists(board.id)
  const [name, setName] = useState(board.name)
  const [accessType, setAccessType] = useState(board.access_type)

  // Количество существующих колонок (по уникальным column_index)
  const columnCount = useMemo(() => {
    if (!lists || lists.length === 0) return 0
    const indices = new Set(lists.map((l) => l.column_index))
    return indices.size
  }, [lists])

  // Overrides — то, что пользователь отредактировал в полях (ключ = индекс колонки).
  // Не делаем массив ширин в стейте, потому что он зависит от columnCount, который может
  // прийти асинхронно (lists грузятся позже). Вместо этого при рендере мёржим overrides
  // с board.column_widths на лету.
  const [overrides, setOverrides] = useState<Record<number, string>>({})

  const getWidthValue = (idx: number): string => {
    if (idx in overrides) return overrides[idx]
    return String(board.column_widths?.[idx] ?? DEFAULT_COLUMN_WIDTH)
  }

  const handleWidthChange = (idx: number, value: string) => {
    // Разрешаем только цифры и пустую строку (чтобы можно было стереть и ввести заново)
    if (value !== '' && !/^\d+$/.test(value)) return
    setOverrides((prev) => ({ ...prev, [idx]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    // Собираем массив ширин из текущих значений UI (мёрж overrides + board.column_widths).
    // Длина = columnCount. Пустые/невалидные → DEFAULT, потом клампим в [MIN, MAX].
    const parsedWidths: number[] = []
    for (let i = 0; i < columnCount; i++) {
      const raw = getWidthValue(i)
      const n = parseInt(raw, 10)
      if (isNaN(n)) {
        parsedWidths.push(DEFAULT_COLUMN_WIDTH)
      } else {
        parsedWidths.push(Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, n)))
      }
    }

    updateBoard.mutate(
      {
        id: board.id,
        workspace_id: board.workspace_id,
        name: name.trim(),
        access_type: accessType,
        column_widths: parsedWidths,
      },
      { onSuccess: onClose },
    )
  }

  const handleDelete = () => {
    if (!confirm('Удалить доску и все её списки?')) return
    deleteBoard.mutate(
      { id: board.id, workspace_id: board.workspace_id },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Настройки доски</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-board-name">Название</Label>
              <Input
                id="edit-board-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Доступ</Label>
              <Select
                value={accessType}
                onValueChange={(v) => setAccessType(v as typeof accessType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workspace">Все участники</SelectItem>
                  <SelectItem value="private">Только я</SelectItem>
                  <SelectItem value="custom">Выбранные</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {columnCount > 0 && (
              <div className="space-y-2">
                <Label>Ширина колонок (px)</Label>
                <div className="text-[11px] text-muted-foreground">
                  От {MIN_COLUMN_WIDTH} до {MAX_COLUMN_WIDTH}px. По умолчанию {DEFAULT_COLUMN_WIDTH}.
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: columnCount }, (_, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Label
                        htmlFor={`col-width-${idx}`}
                        className="text-xs text-muted-foreground whitespace-nowrap"
                      >
                        Колонка {idx + 1}
                      </Label>
                      <Input
                        id={`col-width-${idx}`}
                        type="text"
                        inputMode="numeric"
                        value={getWidthValue(idx)}
                        onChange={(e) => handleWidthChange(idx, e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex justify-between">
            <Button type="button" variant="destructive" size="sm" onClick={handleDelete}>
              Удалить
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Отмена
              </Button>
              <Button type="submit" disabled={!name.trim() || updateBoard.isPending}>
                Сохранить
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
