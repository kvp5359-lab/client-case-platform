"use client"

/**
 * Секция «Сменить пароль» в профиле.
 *
 * Пользователь сам меняет свой пароль (supabase.auth.updateUser). Доступно
 * любому залогиненному, особенно полезно клиентам, которым менеджер выдал
 * сгенерированный пароль и которые хотят задать свой.
 */

import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import { IntegrationRow } from './IntegrationRow'

const MIN_LENGTH = 8

export function ChangePasswordSection() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (password.length < MIN_LENGTH) {
      toast.error(`Пароль должен быть не короче ${MIN_LENGTH} символов`)
      return
    }
    if (password !== confirm) {
      toast.error('Пароли не совпадают')
      return
    }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) {
      toast.error(getUserFacingErrorMessage(error, 'Не удалось сменить пароль'))
      return
    }
    toast.success('Пароль изменён')
    setPassword('')
    setConfirm('')
  }

  return (
    <IntegrationRow
      icon={<KeyRound className="h-5 w-5 text-muted-foreground" />}
      title="Сменить пароль"
      statusLabel=""
      tone="off"
    >
      <div className="space-y-3 max-w-xs">
        <p className="text-xs text-muted-foreground">
          Задайте новый пароль для входа по email и паролю.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">Новый пароль</Label>
          <Input
            id="new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Повторите пароль</Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            disabled={saving}
          />
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || !password || !confirm}
          size="sm"
        >
          {saving ? 'Сохранение...' : 'Сменить пароль'}
        </Button>
      </div>
    </IntegrationRow>
  )
}
