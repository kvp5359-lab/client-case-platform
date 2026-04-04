/**
 * Таблица участников workspace
 */

import { Badge } from '@/components/ui/badge'
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
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Имя
            </th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Email
            </th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Телефон
            </th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Роль
            </th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Доступ
            </th>
          </tr>
        </thead>
        <tbody>
          {participants.map((participant) => (
            <tr key={participant.id} className="border-b hover:bg-gray-50 transition-colors">
              <td className="px-3 py-2 text-sm">
                {participant.name || '—'}
                {participant.last_name && ` ${participant.last_name}`}
              </td>
              <td className="px-3 py-2 text-sm text-gray-500">{participant.email}</td>
              <td className="px-3 py-2 text-sm text-gray-600">{participant.phone || '—'}</td>
              <td className="px-3 py-2">
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
              </td>
              <td className="px-3 py-2 text-right">
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
