"use client"

/**
 * Диалог привязки Telegram-контакта к существующему участнику workspace.
 * При мерже: telegram_user_id переносится, сообщения перелинковываются, контакт удаляется.
 */

import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MessageSquare, Search, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Participant } from '@/types/entities'

interface MergeTelegramContactDialogProps {
  contact: Participant | null
  participants: Participant[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onMerge: (targetId: string) => void
  isLoading: boolean
}

export function MergeTelegramContactDialog({
  contact,
  participants,
  open,
  onOpenChange,
  onMerge,
  isLoading,
}: MergeTelegramContactDialogProps) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return participants
    const q = search.toLowerCase()
    return participants.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.last_name?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q),
    )
  }, [participants, search])

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setSearch('')
      setSelectedId(null)
    }
    onOpenChange(v)
  }

  const contactName = contact ? [contact.name, contact.last_name].filter(Boolean).join(' ') : ''

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Привязать Telegram-контакт</DialogTitle>
          <DialogDescription>
            <span className="flex items-center gap-2 mt-1">
              <MessageSquare className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <span className="font-medium text-foreground">{contactName}</span>
              {contact?.telegram_user_id && (
                <span className="text-muted-foreground font-mono text-xs">
                  (ID: {String(contact.telegram_user_id)})
                </span>
              )}
            </span>
            <span className="block mt-2">
              Выберите участника, с которым нужно объединить этот Telegram-контакт. Все сообщения
              будут перепривязаны.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по имени или email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="max-h-64 overflow-y-auto border rounded-md">
            {filtered.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                Участники не найдены
              </div>
            ) : (
              filtered.map((p) => {
                const fullName = [p.name, p.last_name].filter(Boolean).join(' ')
                const isSelected = selectedId === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(isSelected ? null : p.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                      isSelected
                        ? 'bg-amber-50 border-l-2 border-amber-500'
                        : 'hover:bg-gray-50 border-l-2 border-transparent',
                    )}
                  >
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      {p.avatar_url && <AvatarImage src={p.avatar_url} alt={fullName} />}
                      <AvatarFallback className="text-xs">
                        {p.name?.[0]?.toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{fullName}</div>
                      <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-amber-600 flex-shrink-0" />}
                  </button>
                )
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Отмена
          </Button>
          <Button
            onClick={() => selectedId && onMerge(selectedId)}
            disabled={!selectedId || isLoading}
          >
            {isLoading ? 'Привязка...' : 'Привязать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
