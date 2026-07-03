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
import { Crown, Users, Link, HandshakeIcon, Contact, Camera, X, KeyRound, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ParticipantChannelsBlock } from './ParticipantChannelsBlock'
import { ClientAccessDialog } from './ClientAccessDialog'
import { isEmailDuplicateError } from '@/hooks/permissions/useParticipantsMutations'

export type RoleOption = {
  value: string
  label: string
  icon: LucideIcon
}

const DEFAULT_ROLES: RoleOption[] = [
  { value: 'Администратор', label: 'Администратор', icon: Crown },
  { value: 'Сотрудник', label: 'Сотрудник', icon: Users },
  { value: 'Внешний сотрудник', label: 'Внешний сотрудник', icon: Link },
  { value: 'Клиент', label: 'Клиент', icon: HandshakeIcon },
  { value: 'Внешний контакт', label: 'Внешний контакт', icon: Contact },
]

type EditParticipantDialogProps = {
  participant: Participant | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: Partial<Participant>) => void | Promise<void>
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
  const [telegramUsername, setTelegramUsername] = useState('')
  const [role, setRole] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [canLogin, setCanLogin] = useState(true)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Доступ в личный кабинет (выдача/сброс пароля) — отдельное окно
  const [accessDialogOpen, setAccessDialogOpen] = useState(false)
  const [accessGrantedNow, setAccessGrantedNow] = useState(false)
  const hasLoginAccess = !!participant?.user_id || accessGrantedNow

  const availableRoles = roles

  // Обновляем форму при открытии диалога
  // Синхронизация формы с пропсами — необходимо для инициализации полей при редактировании
   
  useEffect(() => {
    setEmailError(null)
    setAccessGrantedNow(false)
    if (participant) {
      setName(participant.name || '')
      setLastName(participant.last_name || '')
      setEmail(participant.email || '')
      setPhone(participant.phone || '')
      setTelegramUserId(participant.telegram_user_id?.toString() || '')
      setTelegramUsername(participant.telegram_username || '')
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

  const handleClearAvatar = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarPreview(null)
    setAvatarUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailError(null)
    try {
      await onSave({
        name,
        last_name: lastName,
        email,
        phone,
        telegram_user_id: telegramUserId ? Number(telegramUserId) : null,
        telegram_username: telegramUsername.trim().replace(/^@/, '') || null,
        avatar_url: avatarUrl,
        workspace_roles: role ? [role] : [],
        can_login: canLogin,
      })
    } catch (err) {
      // Тост об ошибке показывает мутация; здесь — подсветка поля при дубле email
      if (isEmailDuplicateError(err)) {
        setEmailError('Этот email уже используется другим участником')
      }
    }
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
            {/* Шапка из двух блоков: слева — аватар, справа — роль/статус
                (мета участника, визуально отделена от полей-данных ниже). */}
            <div className="flex items-stretch gap-3">
              {/* Блок 1 — аватар (только при редактировании: нужен participant.id для Storage) */}
              {participant && (
                <div className="flex items-center justify-center rounded-xl border bg-muted/30 p-4">
                  <div className="relative group/avatar shrink-0">
                  <button
                    type="button"
                    className="relative block"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading || isUploading}
                  >
                    <Avatar className="h-16 w-16 ring-2 ring-border shadow-sm">
                      {currentAvatarSrc && <AvatarImage src={currentAvatarSrc} alt={displayName} />}
                      <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
                        {getInitials(displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 md:opacity-0 md:group-hover/avatar:opacity-100 transition-opacity">
                      <Camera className="h-5 w-5 text-white" />
                    </div>
                    {isUploading && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                        <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </button>
                  {currentAvatarSrc && !isUploading && (
                    <button
                      type="button"
                      onClick={handleClearAvatar}
                      disabled={isLoading}
                      className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm ring-1 ring-border md:opacity-0 transition-opacity md:group-hover/avatar:opacity-100 hover:bg-muted hover:text-foreground"
                      aria-label="Удалить аватарку"
                      title="Удалить аватарку"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                  </div>
                </div>
              )}

              {/* Блок 2 — роль + статус доступа компактными пилюлями */}
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5 rounded-xl border bg-muted/30 p-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-12 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Роль
                  </span>
                  <Select value={role} onValueChange={setRole} disabled={isLoading}>
                    <SelectTrigger
                      id="role"
                      className="h-8 flex-1 rounded-full border-transparent bg-background px-3.5 text-sm font-medium shadow-sm hover:bg-background/70"
                    >
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

                <div className="flex items-center gap-2.5">
                  <span className="w-12 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Доступ
                  </span>
                  <Select
                    value={canLogin ? 'active' : 'blocked'}
                    onValueChange={(value) => setCanLogin(value === 'active')}
                    disabled={isLoading}
                  >
                    <SelectTrigger
                      id="status"
                      className={cn(
                        'h-8 flex-1 rounded-full border-transparent px-3.5 text-sm font-medium shadow-sm',
                        canLogin
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400'
                          : 'bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400',
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'h-2 w-2 rounded-full',
                            canLogin ? 'bg-emerald-500' : 'bg-rose-500',
                          )}
                        />
                        <SelectValue />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Активен</SelectItem>
                      <SelectItem value="blocked">Заблокирован</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Доступ в личный кабинет — круглая кнопка открывает окно выдачи/сброса пароля */}
                  {participant && (
                    <button
                      type="button"
                      onClick={() => setAccessDialogOpen(true)}
                      disabled={isLoading}
                      title={
                        hasLoginAccess
                          ? 'Доступ в личный кабинет — сбросить пароль'
                          : 'Выдать доступ в личный кабинет по паролю'
                      }
                      className={cn(
                        'h-8 w-8 shrink-0 flex items-center justify-center rounded-full border shadow-sm transition-colors',
                        hasLoginAccess
                          ? 'bg-brand-100 text-brand-700 border-transparent hover:bg-brand-200'
                          : 'bg-background hover:bg-muted/70',
                      )}
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (emailError) setEmailError(null)
                  }}
                  placeholder="email@example.com"
                  required
                  disabled={isLoading}
                  aria-invalid={!!emailError}
                  className={
                    emailError ? 'border-destructive focus-visible:ring-destructive' : ''
                  }
                />
                {emailError && <p className="text-sm text-destructive">{emailError}</p>}
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
            </div>

            <div className="grid grid-cols-2 gap-3">
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
                <Label htmlFor="telegramUsername">Telegram username</Label>
                <Input
                  id="telegramUsername"
                  type="text"
                  value={telegramUsername}
                  onChange={(e) => setTelegramUsername(e.target.value)}
                  placeholder="@username"
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Ник в Telegram — чтобы найти диалог по @username
                </p>
              </div>
            </div>

            {/* Каналы связи — доступны только для существующего participant'а
                (нужен participant.id для FK). Поля выше (email/phone/tg) пока
                остаются как «основной» канал каждого типа — миграция UI поэтапная. */}
            {participant && (
              <div className="pt-3 border-t">
                <ParticipantChannelsBlock
                  participantId={participant.id}
                  workspaceId={participant.workspace_id}
                />
              </div>
            )}

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

        {participant && (
          <ClientAccessDialog
            open={accessDialogOpen}
            onOpenChange={setAccessDialogOpen}
            participantId={participant.id}
            workspaceId={participant.workspace_id}
            email={email}
            hasAccess={hasLoginAccess}
            onGranted={() => setAccessGrantedNow(true)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
