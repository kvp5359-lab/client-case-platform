/**
 * Таблица участников workspace
 */

import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { ParticipantMenu } from './ParticipantMenu'
import { ROLE_CONFIG } from '../constants/roleConfig'
import type { Participant } from '@/types/entities'

interface ParticipantsTableProps {
  participants: Participant[]
  onEdit: (participant: Participant) => void
  onToggleAccess: (participantId: string, currentCanLogin: boolean) => void
  onDelete: (participantId: string) => void
  actionInProgressId: string | null
  canManage: boolean
}

export function ParticipantsTable({
  participants,
  onEdit,
  onToggleAccess,
  onDelete,
  actionInProgressId,
  canManage,
}: ParticipantsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Имя</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Телефон</TableHead>
          <TableHead>Роль</TableHead>
          <TableHead className="text-right">Доступ</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {participants.map((participant) => (
          <TableRow key={participant.id}>
            <TableCell className="text-sm">
              {participant.name || '—'}
              {participant.last_name && ` ${participant.last_name}`}
            </TableCell>
            <TableCell className="text-sm text-gray-500">{participant.email}</TableCell>
            <TableCell className="text-sm text-gray-600">{participant.phone || '—'}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {participant.workspace_roles &&
                  Array.isArray(participant.workspace_roles) &&
                  participant.workspace_roles.map((role: string) => {
                    const roleConfig = ROLE_CONFIG.find((r) => r.key === role)
                    const Icon = roleConfig?.icon
                    return (
                      <Badge
                        key={role}
                        variant="secondary"
                        className="text-xs flex items-center gap-1"
                      >
                        {Icon && <Icon className="h-3 w-3" />}
                        {role}
                      </Badge>
                    )
                  })}
                {(!participant.workspace_roles ||
                  (Array.isArray(participant.workspace_roles) &&
                    participant.workspace_roles.length === 0)) && (
                  <span className="text-xs text-gray-500">—</span>
                )}
              </div>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center gap-2 justify-end">
                <Badge
                  variant={participant.can_login ? 'default' : 'outline'}
                  className="text-xs"
                >
                  {participant.can_login ? '✓ Активен' : '✗ Заблокирован'}
                </Badge>
                <ParticipantMenu
                  participant={participant}
                  onEdit={onEdit}
                  onToggleAccess={onToggleAccess}
                  onDelete={onDelete}
                  isLoading={actionInProgressId === participant.id}
                  canManage={canManage}
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
