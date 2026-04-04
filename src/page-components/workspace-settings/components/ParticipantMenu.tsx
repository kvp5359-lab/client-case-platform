/**
 * ParticipantMenu - меню действий для участника
 */

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Edit, Lock, LockOpen, Trash2 } from 'lucide-react'
import type { Participant } from '@/types/entities'

interface ParticipantMenuProps {
  participant: Participant
  onEdit: (participant: Participant) => void
  onToggleAccess: (participantId: string, currentCanLogin: boolean) => void
  onDelete: (participantId: string) => void
  isLoading: boolean
  canManage?: boolean
}

export function ParticipantMenu({
  participant,
  onEdit,
  onToggleAccess,
  onDelete,
  isLoading,
  canManage = true
}: ParticipantMenuProps) {
  // Если нет прав на управление, не показываем меню
  if (!canManage) {
    return null
  }

  return (
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
  )
}
