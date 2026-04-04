/**
 * Диалог создания нового чата в проекте.
 * Поддерживает обычный чат и email-чат.
 */

import { useState } from 'react'
import { MessageSquare, Users, UserCheck, Mail } from 'lucide-react'
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

type AccessType = 'all' | 'team' | 'custom'
type ChannelType = 'chat' | 'email'

export interface CreateChatResult {
  name: string
  accessType: AccessType
  channelType: ChannelType
  contactEmail?: string
  emailSubject?: string
}

interface CreateChatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (result: CreateChatResult) => void
  isPending?: boolean
}

const CHANNEL_OPTIONS: {
  value: ChannelType
  label: string
  description: string
  icon: typeof MessageSquare
}[] = [
  {
    value: 'chat',
    label: 'Обычный чат',
    description: 'Текстовый чат в проекте',
    icon: MessageSquare,
  },
  { value: 'email', label: 'Email-переписка', description: 'Письма через Gmail', icon: Mail },
]

const ACCESS_OPTIONS: {
  value: AccessType
  label: string
  description: string
  icon: typeof MessageSquare
}[] = [
  { value: 'all', label: 'Все участники', description: 'Клиент и команда', icon: MessageSquare },
  { value: 'team', label: 'Только команда', description: 'Клиент не видит', icon: Users },
  { value: 'custom', label: 'Выборочно', description: 'Конкретные люди', icon: UserCheck },
]

export function CreateChatDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: CreateChatDialogProps) {
  const [channelType, setChannelType] = useState<ChannelType>('chat')
  const [name, setName] = useState('')
  const [accessType, setAccessType] = useState<AccessType>('all')
  const [contactEmail, setContactEmail] = useState('')
  const [emailSubject, setEmailSubject] = useState('')

  const isEmail = channelType === 'email'

  const handleConfirm = () => {
    if (isEmail) {
      const email = contactEmail.trim()
      if (!email) return
      const chatName = name.trim() || emailSubject.trim() || `Email: ${email}`
      onConfirm({
        name: chatName,
        accessType,
        channelType: 'email',
        contactEmail: email,
        emailSubject: emailSubject.trim() || undefined,
      })
    } else {
      const trimmed = name.trim()
      if (!trimmed) return
      onConfirm({ name: trimmed, accessType, channelType: 'chat' })
    }
    resetForm()
  }

  const resetForm = () => {
    setChannelType('chat')
    setName('')
    setAccessType('all')
    setContactEmail('')
    setEmailSubject('')
  }

  const canConfirm = isEmail ? contactEmail.trim().length > 0 : name.trim().length > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) resetForm()
      }}
    >
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Новый чат</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          {/* Выбор канала */}
          <div className="flex flex-col gap-1.5">
            <Label>Канал</Label>
            <div className="flex gap-2">
              {CHANNEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setChannelType(opt.value)}
                  className={cn(
                    'flex-1 flex items-center gap-2 px-3 py-2 rounded-md border text-sm text-left transition-colors',
                    channelType === opt.value
                      ? opt.value === 'email'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-yellow-600/10 border-yellow-600/30 text-yellow-700 font-medium'
                      : 'border-transparent hover:bg-muted/50 text-muted-foreground',
                  )}
                >
                  <opt.icon className="h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-[11px] text-muted-foreground">{opt.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Email-специфичные поля */}
          {isEmail && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contact-email">Email клиента</Label>
                <Input
                  id="contact-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="client@company.com"
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email-subject">
                  Тема письма{' '}
                  <span className="text-muted-foreground font-normal">(опционально)</span>
                </Label>
                <Input
                  id="email-subject"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Например: Договор аренды"
                />
              </div>
            </>
          )}

          {/* Название чата */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chat-name">
              Название чата{' '}
              {isEmail && <span className="text-muted-foreground font-normal">(опционально)</span>}
            </Label>
            <Input
              id="chat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                isEmail ? 'По умолчанию: тема письма или email' : 'Например: Вопросы по договору'
              }
              autoFocus={!isEmail}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canConfirm) handleConfirm()
              }}
            />
          </div>

          {/* Доступ */}
          <div className="flex flex-col gap-1.5">
            <Label>Кто видит чат</Label>
            <div className="flex flex-col gap-1">
              {ACCESS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAccessType(opt.value)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md border text-sm text-left transition-colors',
                    accessType === opt.value
                      ? 'bg-yellow-600/10 border-yellow-600/30 text-yellow-700 font-medium'
                      : 'border-transparent hover:bg-muted/50 text-muted-foreground',
                  )}
                >
                  <opt.icon className="h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm || isPending}>
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
