/**
 * Таблица участников workspace
 */

import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { Phone, Send } from 'lucide-react'
import { getInitials } from '@/utils/avatarHelpers'
import { ParticipantMenu } from './ParticipantMenu'
import { ROLE_CONFIG } from '../constants/roleConfig'
import type { Participant } from '@/types/entities'

type ParticipantsTableProps = {
  participants: Participant[]
  onEdit: (participant: Participant) => void
  onToggleAccess: (participantId: string, currentCanLogin: boolean) => void
  onDelete: (participantId: string) => void
  onSetPassword?: (participantId: string) => Promise<{ login: string; password: string } | null>
  actionInProgressId: string | null
  canManage: boolean
  canImpersonate?: boolean
  workspaceId?: string
}

type ChannelIcon = { key: string; icon: typeof Phone; label: string }

function getChannelIcons(p: Participant): ChannelIcon[] {
  const out: ChannelIcon[] = []
  if (p.phone) out.push({ key: 'phone', icon: Phone, label: p.phone })
  if (p.telegram_username) {
    out.push({ key: 'tg', icon: Send, label: `@${p.telegram_username}` })
  } else if (p.telegram_user_id != null) {
    out.push({ key: 'tg', icon: Send, label: `Telegram ID: ${p.telegram_user_id}` })
  }
  return out
}

export function ParticipantsTable({
  participants,
  onEdit,
  onToggleAccess,
  onDelete,
  onSetPassword,
  actionInProgressId,
  canManage,
  canImpersonate,
  workspaceId,
}: ParticipantsTableProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Table className="w-full table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[22%]">Имя</TableHead>
            <TableHead className="w-[24%]">Email</TableHead>
            <TableHead className="w-[80px] text-center whitespace-nowrap">Контакты</TableHead>
            <TableHead className="w-[180px]">Роль</TableHead>
            <TableHead className="w-[170px]">Доступ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {participants.map((participant) => {
            const channels = getChannelIcons(participant)
            return (
              <TableRow key={participant.id}>
                <TableCell className="py-1.5 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="h-6 w-6 shrink-0">
                      {participant.avatar_url && (
                        <AvatarImage src={participant.avatar_url} alt={participant.name || ''} />
                      )}
                      <AvatarFallback className="text-[10px] bg-muted">
                        {getInitials(
                          [participant.name, participant.last_name].filter(Boolean).join(' ') || '—',
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">
                      {participant.name || '—'}
                      {participant.last_name && ` ${participant.last_name}`}
                    </span>
                  </div>
                </TableCell>

                <TableCell
                  className="py-1.5 text-sm text-gray-500 truncate"
                  title={participant.email ?? undefined}
                >
                  {participant.email}
                </TableCell>

                <TableCell className="py-1.5">
                  <div className="flex items-center justify-center gap-1.5">
                    {channels.length === 0 ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      channels.map((c) => {
                        const Icon = c.icon
                        return (
                          <Tooltip key={c.key}>
                            <TooltipTrigger asChild>
                              <span className="text-gray-400 hover:text-gray-600 cursor-default">
                                <Icon className="h-4 w-4" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{c.label}</TooltipContent>
                          </Tooltip>
                        )
                      })
                    )}
                  </div>
                </TableCell>

                <TableCell className="py-1.5">
                  <div className="flex flex-nowrap items-center gap-1">
                    {participant.workspace_roles &&
                    Array.isArray(participant.workspace_roles) &&
                    participant.workspace_roles.length > 0 ? (
                      participant.workspace_roles.map((role: string) => {
                        const roleConfig = ROLE_CONFIG.find((r) => r.key === role)
                        const Icon = roleConfig?.icon
                        return (
                          <Badge
                            key={role}
                            variant="secondary"
                            className="text-xs flex items-center gap-1 whitespace-nowrap"
                          >
                            {Icon && <Icon className="h-3 w-3 shrink-0" />}
                            {role}
                          </Badge>
                        )
                      })
                    ) : (
                      <span className="text-xs text-gray-500">—</span>
                    )}
                  </div>
                </TableCell>

                <TableCell className="py-1.5">
                  <div className="flex items-center gap-2">
                    {!participant.user_id ? (
                      <Badge variant="outline" className="text-xs text-muted-foreground whitespace-nowrap">
                        Доступ не выдан
                      </Badge>
                    ) : (
                      <Badge
                        variant={participant.can_login ? 'default' : 'outline'}
                        className="text-xs whitespace-nowrap"
                      >
                        {participant.can_login ? '✓ Активен' : '✗ Заблокирован'}
                      </Badge>
                    )}
                    <ParticipantMenu
                      participant={participant}
                      onEdit={onEdit}
                      onToggleAccess={onToggleAccess}
                      onDelete={onDelete}
                      onSetPassword={onSetPassword}
                      isLoading={actionInProgressId === participant.id}
                      canManage={canManage}
                      canImpersonate={canImpersonate}
                      workspaceId={workspaceId}
                    />
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TooltipProvider>
  )
}
