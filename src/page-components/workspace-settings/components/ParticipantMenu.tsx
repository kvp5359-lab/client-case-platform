/**
 * ParticipantMenu - меню действий для участника
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Edit, Lock, LockOpen, Trash2, Eye } from 'lucide-react'
import type { Participant } from '@/types/entities'
import { StartImpersonationDialog } from '@/components/impersonation/StartImpersonationDialog'

type ParticipantMenuProps = {
  participant: Participant
  onEdit: (participant: Participant) => void
  onToggleAccess: (participantId: string, currentCanLogin: boolean) => void
  onDelete: (participantId: string) => void
  isLoading: boolean
  canManage?: boolean
  /** Может ли текущий пользователь импersonировать (он владелец воркспейса). */
  canImpersonate?: boolean
  workspaceId?: string
}

export function ParticipantMenu({
  participant,
  onEdit,
  onToggleAccess,
  onDelete,
  isLoading,
  canManage = true,
  canImpersonate = false,
  workspaceId,
}: ParticipantMenuProps) {
  const [impersonateDialogOpen, setImpersonateDialogOpen] = useState(false)

  // Если нет прав на управление, не показываем меню
  if (!canManage) {
    return null
  }

  // Можно ли заходить под этого участника:
  // — есть user_id (привязан к auth-юзеру);
  // — не сам владелец (другой Владелец);
  // — пункт виден только владельцу (canImpersonate).
  const targetIsOwner =
    Array.isArray(participant.workspace_roles) &&
    participant.workspace_roles.includes('Владелец')
  const showImpersonate =
    canImpersonate && !!participant.user_id && !targetIsOwner && !!workspaceId
  const targetName =
    [participant.name, participant.last_name].filter(Boolean).join(' ') ||
    participant.email ||
    'участник'

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={isLoading}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs">Действия</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => onEdit(participant)}
          className="text-xs cursor-pointer"
        >
          <Edit className="mr-2 h-4 w-4" />
          Редактировать
        </DropdownMenuItem>

        {showImpersonate && (
          <DropdownMenuItem
            onClick={() => setImpersonateDialogOpen(true)}
            className="text-xs cursor-pointer"
          >
            <Eye className="mr-2 h-4 w-4" />
            Войти под пользователем
          </DropdownMenuItem>
        )}

        <DropdownMenuItem
          onClick={() => onToggleAccess(participant.id, participant.can_login)}
          className="text-xs"
        >
          {participant.can_login ? (
            <>
              <Lock className="mr-2 h-4 w-4" />
              Заблокировать
            </>
          ) : (
            <>
              <LockOpen className="mr-2 h-4 w-4" />
              Разблокировать
            </>
          )}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => onDelete(participant.id)}
          className="text-xs text-red-600 focus:text-red-600 focus:bg-red-50"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Удалить
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {showImpersonate && participant.user_id && workspaceId && (
      <StartImpersonationDialog
        open={impersonateDialogOpen}
        onOpenChange={setImpersonateDialogOpen}
        workspaceId={workspaceId}
        targetUserId={participant.user_id}
        targetName={targetName}
      />
    )}
    </>
  )
}
