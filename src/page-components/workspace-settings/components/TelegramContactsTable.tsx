/**
 * Таблица Telegram-контактов
 */

import { LinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { Participant } from '@/types/entities'

interface TelegramContactsTableProps {
  contacts: Participant[]
  canManage: boolean
  hasRegularParticipants: boolean
  onMerge: (contact: Participant) => void
}

export function TelegramContactsTable({
  contacts,
  canManage,
  hasRegularParticipants,
  onMerge,
}: TelegramContactsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Контакт</TableHead>
          <TableHead>Telegram ID</TableHead>
          <TableHead className="text-right">Действия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {contacts.map((contact) => (
          <TableRow key={contact.id}>
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  {contact.avatar_url && (
                    <AvatarImage src={contact.avatar_url} alt={contact.name} />
                  )}
                  <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                    {contact.name?.[0]?.toUpperCase() || 'T'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">
                  {contact.name}
                  {contact.last_name && ` ${contact.last_name}`}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-sm text-gray-500 font-mono">
              {contact.telegram_user_id || '—'}
            </TableCell>
            <TableCell className="text-right">
              {canManage && hasRegularParticipants && (
                <Button variant="outline" size="sm" onClick={() => onMerge(contact)}>
                  <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
                  Привязать к участнику
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
