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
import { useAuth } from '@/contexts/AuthContext'
import { useCreateBoard } from './hooks/useBoardMutations'

interface CreateBoardDialogProps {
  open: boolean
  onClose: () => void
  workspaceId: string
}

export function CreateBoardDialog({ open, onClose, workspaceId }: CreateBoardDialogProps) {
  const { user } = useAuth()
  const createBoard = useCreateBoard()
  const [name, setName] = useState('')
  const [accessType, setAccessType] = useState<'workspace' | 'private' | 'custom'>('workspace')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !user) return

    createBoard.mutate(
      {
        workspace_id: workspaceId,
        name: name.trim(),
        access_type: accessType,
        created_by: user.id,
      },
      {
        onSuccess: () => {
          setName('')
          setAccessType('workspace')
          onClose()
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Новая доска</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="board-name">Название</Label>
              <Input
                id="board-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Моя доска"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Доступ</Label>
              <Select value={accessType} onValueChange={(v) => setAccessType(v as typeof accessType)}>
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
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={!name.trim() || createBoard.isPending}>
              {createBoard.isPending ? 'Создаю...' : 'Создать'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
