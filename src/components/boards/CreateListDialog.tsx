"use client"

import { useState } from 'react'
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
import { useCreateList } from './hooks/useListMutations'

interface CreateListDialogProps {
  open: boolean
  onClose: () => void
  boardId: string
  existingColumns: number
}

export function CreateListDialog({
  open,
  onClose,
  boardId,
  existingColumns,
}: CreateListDialogProps) {
  const createList = useCreateList()
  const [name, setName] = useState('')
  const [entityType, setEntityType] = useState<'task' | 'project' | 'inbox'>('task')
  const [columnIndex, setColumnIndex] = useState('0')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    createList.mutate(
      {
        board_id: boardId,
        name: name.trim(),
        entity_type: entityType,
        column_index: parseInt(columnIndex, 10),
      },
      {
        onSuccess: () => {
          setName('')
          setEntityType('task')
          setColumnIndex('0')
          onClose()
        },
      },
    )
  }

  // Генерируем опции колонок: существующие + одна новая
  const columnOptions = Array.from({ length: existingColumns + 1 }, (_, i) => i)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Новый список</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="list-name">Название</Label>
              <Input
                id="list-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Мои задачи"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Что показывать</Label>
              <Select value={entityType} onValueChange={(v) => setEntityType(v as 'task' | 'project' | 'inbox')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="task">Задачи</SelectItem>
                  <SelectItem value="project">Проекты</SelectItem>
                  <SelectItem value="inbox">Входящие</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Колонка</Label>
              <Select value={columnIndex} onValueChange={setColumnIndex}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {columnOptions.map((i) => (
                    <SelectItem key={i} value={String(i)}>
                      {i < existingColumns ? `Колонка ${i + 1}` : `Новая колонка (${i + 1})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={!name.trim() || createList.isPending}>
              {createList.isPending ? 'Создаю...' : 'Создать'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
