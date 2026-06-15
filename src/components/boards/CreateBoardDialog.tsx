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
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { ParticipantsPicker } from '@/components/participants/ParticipantsPicker'
import { useCreateBoard } from './hooks/useBoardMutations'

type CreateBoardDialogProps = {
  open: boolean
  onClose: () => void
  workspaceId: string
}

export function CreateBoardDialog({ open, onClose, workspaceId }: CreateBoardDialogProps) {
  const { user } = useAuth()
  const createBoard = useCreateBoard()
  const [name, setName] = useState('')
  const [accessType, setAccessType] = useState<'workspace' | 'private' | 'custom'>('workspace')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const { data: participants = [] } = useWorkspaceParticipants(workspaceId)
  const myParticipantId = participants.find((p) => p.user_id === user?.id)?.id ?? null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !user) return

    // Для 'custom' гарантируем, что создатель в списке — иначе он потеряет
    // доступ к собственной доске (read-side проверяет только roles/members).
    const finalMembers =
      accessType === 'custom'
        ? Array.from(new Set([...memberIds, ...(myParticipantId ? [myParticipantId] : [])]))
        : undefined

    createBoard.mutate(
      {
        workspace_id: workspaceId,
        name: name.trim(),
        access_type: accessType,
        created_by: user.id,
        memberIds: finalMembers,
      },
      {
        onSuccess: () => {
          setName('')
          setAccessType('workspace')
          setMemberIds([])
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
              <Select
                value={accessType}
                onValueChange={(v) => {
                  const next = v as typeof accessType
                  setAccessType(next)
                  // При переключении на «Выбранные» сразу добавляем создателя.
                  if (next === 'custom' && memberIds.length === 0 && myParticipantId) {
                    setMemberIds([myParticipantId])
                  }
                }}
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
            {accessType === 'custom' && (
              <div className="space-y-2">
                <Label>Кому доступна</Label>
                <ParticipantsPicker
                  participants={participants}
                  selectedIds={memberIds}
                  onChange={setMemberIds}
                  placeholder="Выбрать участников"
                />
              </div>
            )}
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
