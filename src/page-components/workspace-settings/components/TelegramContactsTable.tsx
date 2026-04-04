/**
 * Таблица Telegram-контактов
 */

import { LinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Контакт
            </th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Telegram ID
            </th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Действия
            </th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => (
            <tr key={contact.id} className="border-b hover:bg-gray-50 transition-colors">
              <td className="px-3 py-2">
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
              </td>
              <td className="px-3 py-2 text-sm text-gray-500 font-mono">
                {contact.telegram_user_id || '—'}
              </td>
              <td className="px-3 py-2 text-right">
                {canManage && hasRegularParticipants && (
                  <Button variant="outline" size="sm" onClick={() => onMerge(contact)}>
                    <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
                    Привязать к участнику
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
