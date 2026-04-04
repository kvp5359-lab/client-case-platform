"use client"

/**
 * EditParticipantDialog Component
 * Диалог для создания и редактирования участников workspace
 */

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { Participant } from '@/types/entities'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { getInitials } from '@/utils/avatarHelpers'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Crown, Users, Link, HandshakeIcon, Camera, type LucideIcon } from 'lucide-react'

export interface RoleOption {
  value: string
  label: string
  icon: LucideIcon
}

const DEFAULT_ROLES: RoleOption[] = [
  { value: 'Администратор', label: 'Администратор', icon: Crown },
  { value: 'Сотрудник', label: 'Сотрудник', icon: Users },
  { value: 'Внешний сотрудник', label: 'Внешний сотрудник', icon: Link },
  { value: 'Клиент', label: 'Клиент', icon: HandshakeIcon },
]

interface EditParticipantDialogProps {
  participant: Participant | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: Partial<Participant>) => void
  isLoading: boolean
  defaultRole?: string
  roles?: RoleOption[]
}

export function EditParticipantDialog({
  participant,
  open,
  onOpenChange,
  onSave,
  isLoading,
  defaultRole,
  roles = DEFAULT_ROLES,
}: EditParticipantDialogProps) {
  const [name, setName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [telegramUserId, setTelegramUserId] = useState('')
  const [role, setRole] = useState('')
  const [canLogin, setCanLogin] = useState(true)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const availableRoles = roles

  // Обновляем форму при открытии диалога
  // Синхронизация формы с пропсами — необходимо для инициализации полей при редактировании
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (participant) {
      setName(participant.name || '')
      setLastName(participant.last_name || '')
      setEmail(participant.email || '')
      setPhone(participant.phone || '')
      setTelegramUserId(participant.telegram_user_id?.toString() || '')
      setCanLogin(participant.can_login)
      setAvatarUrl(participant.avatar_url || null)
      setAvatarPreview(null)

      // Берём первую роль из массива или пустую строку
      const roles = Array.isArray(participant.workspace_roles) ? participant.workspace_roles : []
      setRole(roles[0] || '')
    } else {
      // Сбрасываем форму для нового участника
      setName('')
      setLastName('')
      setEmail('')
      setPhone('')
      setTelegramUserId('')
      // Если передана defaultRole, используем её
      setRole(defaultRole || '')
      setCanLogin(true)
      setAvatarUrl(null)
      setAvatarPreview(null)
    }
  }, [participant, open, defaultRole])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Очищаем Object URL при размонтировании
  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    }
  }, [avatarPreview])

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !participant) return

    // Проверка размера (2 МБ макс)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Максимальный размер файла — 2 МБ')
      return
    }

    // Предпросмотр — освобождаем предыдущий Object URL перед созданием нового
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    const preview = URL.createObjectURL(file)
    setAvatarPreview(preview)

    // Загрузка в Storage
    setIsUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const storagePath = `${participant.workspace_id}/${participant.id}.${ext}`

      const { error } = await supabase.storage
        .from('participant-avatars')
        .upload(storagePath, file, { upsert: true })

      if (error) throw error

      const { data: urlData } = supabase.storage
        .from('participant-avatars')
        .getPublicUrl(storagePath)

      // Добавляем timestamp для сброса кеша
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`
      setAvatarUrl(publicUrl)
    } catch (err) {
      logger.error('Ошибка загрузки аватарки:', err)
      toast.error('Не удалось загрузить аватарку')
      // Освобождаем Object URL при ошибке загрузки
      if (preview) URL.revokeObjectURL(preview)
      setAvatarPreview(null)
    } finally {
      setIsUploading(false)
      // Сбрасываем input чтобы можно было загрузить тот же файл снова
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      name,
      last_name: lastName,
      email,
      phone,
      telegram_user_id: telegramUserId ? Number(telegramUserId) : null,
      avatar_url: avatarUrl,
      workspace_roles: role ? [role] : [],
      can_login: canLogin,
    })
  }

  const displayName = [name, lastName].filter(Boolean).join(' ') || 'Участник'
  const currentAvatarSrc = avatarPreview || avatarUrl

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {participant ? 'Редактирование участника' : 'Добавление участника'}
          </DialogTitle>
          <DialogDescription>
            {participant
              ? 'Измените данные участника рабочего пространства'
              : 'Добавьте нового участника в рабочее пространство'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Аватарка — только для редактирования (нужен participant.id для пути в Storage) */}
            {participant && (
              <div className="flex justify-center">
                <button
                  type="button"
                  className="relative group"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isUploading}
                >
                  <Avatar className="h-20 w-20">
                    {currentAvatarSrc && <AvatarImage src={currentAvatarSrc} alt={displayName} />}
                    <AvatarFallback className="text-lg font-medium bg-muted">
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="h-5 w-5 text-white" />
                  </div>
                  {isUploading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                      <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>
            )}

            {/* Имя и Фамилия в одну строку */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Имя</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Введите имя"
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">Фамилия</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Введите фамилию"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Телефон</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+7 (999) 123-45-67"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telegramUserId">Telegram ID</Label>
              <Input
                id="telegramUserId"
                type="text"
                inputMode="numeric"
                value={telegramUserId}
                onChange={(e) => setTelegramUserId(e.target.value.replace(/\D/g, ''))}
                placeholder="Числовой ID"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Узнать свой ID: напишите @userinfobot в Telegram
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Роль в workspace</Label>
              <Select value={role} onValueChange={setRole} disabled={isLoading}>
                <SelectTrigger id="role">
                  <SelectValue placeholder="Выберите роль" />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      <div className="flex items-center gap-2">
                        <r.icon className="size-4" />
                        {r.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Статус доступа</Label>
              <Select
                value={canLogin ? 'active' : 'blocked'}
                onValueChange={(value) => setCanLogin(value === 'active')}
                disabled={isLoading}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">✓ Активен</SelectItem>
                  <SelectItem value="blocked">✗ Заблокирован</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={isLoading || isUploading}>
              {isLoading ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
