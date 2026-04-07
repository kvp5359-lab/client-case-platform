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
import { useUpdateBoard, useDeleteBoard } from './hooks/useBoardMutations'
import type { Board } from './types'

interface EditBoardDialogProps {
  open: boolean
  onClose: () => void
  board: Board
}

export function EditBoardDialog({ open, onClose, board }: EditBoardDialogProps) {
  const updateBoard = useUpdateBoard()
  const deleteBoard = useDeleteBoard()
  const [name, setName] = useState(board.name)
  const [accessType, setAccessType] = useState(board.access_type)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    updateBoard.mutate(
      {
        id: board.id,
        workspace_id: board.workspace_id,
        name: name.trim(),
        access_type: accessType,
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
