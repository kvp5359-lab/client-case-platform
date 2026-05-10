"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListChecks, FolderOpen, User, Users } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { useCreateItemList, type ItemListEntityType } from '@/hooks/useItemLists'

interface CreateItemListDialogProps {
  open: boolean
  onClose: () => void
  workspaceId: string
  /** Если задан — навигация на страницу созданного списка после успеха. */
  navigateAfterCreate?: boolean
}

type Visibility = 'personal' | 'workspace'

export function CreateItemListDialog({
  open,
  onClose,
  workspaceId,
  navigateAfterCreate = true,
}: CreateItemListDialogProps) {
  const router = useRouter()
  const { user } = useAuth()
  const { isOwner, can } = useWorkspacePermissions({ workspaceId })
  const canCreateShared = isOwner || can('manage_workspace_settings')

  const create = useCreateItemList()
  const [name, setName] = useState('')
  const [entityType, setEntityType] = useState<ItemListEntityType>('thread')
  const [visibility, setVisibility] = useState<Visibility>('personal')

  const reset = () => {
    setName('')
    setEntityType('thread')
    setVisibility('personal')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !user) return
    create.mutate(
      {
        workspace_id: workspaceId,
        entity_type: entityType,
        name: name.trim(),
        owner_user_id: visibility === 'personal' ? user.id : null,
      },
      {
        onSuccess: (created) => {
          reset()
          onClose()
          if (navigateAfterCreate) {
            router.push(`/workspaces/${workspaceId}/lists/${created.id}`)
          }
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && (reset(), onClose())}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Новый список</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <Label htmlFor="il-name">Название</Label>
              <Input
                id="il-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Мои просроченные задачи"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Что показывать</Label>
              <div className="flex gap-2">
                <SelectorButton
                  active={entityType === 'thread'}
                  onClick={() => setEntityType('thread')}
                  icon={<ListChecks className="h-3.5 w-3.5" />}
                  label="Треды"
                />
                <SelectorButton
                  active={entityType === 'project'}
                  onClick={() => setEntityType('project')}
                  icon={<FolderOpen className="h-3.5 w-3.5" />}
                  label="Проекты"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Доступ</Label>
              <div className="flex gap-2">
                <SelectorButton
                  active={visibility === 'personal'}
                  onClick={() => setVisibility('personal')}
                  icon={<User className="h-3.5 w-3.5" />}
                  label="Только я"
                />
                <SelectorButton
                  active={visibility === 'workspace'}
                  onClick={() => setVisibility('workspace')}
                  icon={<Users className="h-3.5 w-3.5" />}
                  label="Все в воркспейсе"
                  disabled={!canCreateShared}
                />
              </div>
              {visibility === 'workspace' && !canCreateShared && (
                <p className="text-xs text-muted-foreground">
                  Общие списки могут создавать владелец и менеджеры с правом «Управлять настройками воркспейса».
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={
                !name.trim() ||
                create.isPending ||
                (visibility === 'workspace' && !canCreateShared)
              }
            >
              {create.isPending ? 'Создаю…' : 'Создать'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SelectorButton({
  active,
  onClick,
  icon,
  label,
  disabled,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border transition-colors',
        active
          ? 'border-primary bg-primary/5 text-primary'
          : 'border-border text-muted-foreground hover:text-foreground',
        disabled && 'opacity-50 cursor-not-allowed hover:text-muted-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
