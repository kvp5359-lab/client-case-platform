"use client"

/**
 * Email OTP — шаг 2: ввод кода подтверждения
 */

import { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KeyRound } from 'lucide-react'
import { AuthAlert } from './AuthAlert'

interface OtpCodeStepProps {
  code: string
  email: string
  onCodeChange: (code: string) => void
  onSubmit: (e: FormEvent) => void
  onBack: () => void
  onResend: () => void
  error: string | null
  success: string | null
  loading: boolean
  cooldown: number
}

export function OtpCodeStep({
  code,
  email,
  onCodeChange,
  onSubmit,
  onBack,
  onResend,
  error,
  success,
  loading,
  cooldown,
}: OtpCodeStepProps) {
  return (
    <div className="space-y-4">
      <Button type="button" variant="ghost" onClick={onBack} className="w-full justify-start px-0">
        ← Назад к способам авторизации
      </Button>

      <form onSubmit={onSubmit} className="space-y-4 pt-4">
        <div className="space-y-2">
          <Label htmlFor="otp-code" className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Код подтверждения
          </Label>
          <Input
            id="otp-code"
            type="text"
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            placeholder="Введите код из письма"
            required
            disabled={loading}
            autoComplete="one-time-code"
          />
          <p className="text-xs text-muted-foreground">
            Код отправлен на: <strong>{email}</strong>
          </p>
        </div>

        <AuthAlert error={error} success={success} />

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Проверка...' : 'Подтвердить код'}
        </Button>

        <button
          type="button"
          onClick={onResend}
          disabled={loading || cooldown > 0}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto block disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {cooldown > 0 ? `Повторить через ${cooldown} сек` : 'Отправить код повторно'}
        </button>
      </form>
    </div>
  )
}
