"use client"

/**
 * Email OTP — шаг 1: ввод email и отправка кода
 */

import { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GoogleIcon } from '@/components/ui/google-icon'
import { AuthAlert } from './AuthAlert'

interface OtpEmailStepProps {
  email: string
  onEmailChange: (email: string) => void
  onSubmit: (e: FormEvent) => void
  onGoogleLogin: () => void
  onShowPasswordForm: () => void
  error: string | null
  success: string | null
  loading: boolean
}

export function OtpEmailStep({
  email,
  onEmailChange,
  onSubmit,
  onGoogleLogin,
  onShowPasswordForm,
  error,
  success,
  loading,
}: OtpEmailStepProps) {
  return (
    <div className="space-y-4">
      {/* Google OAuth */}
      <Button
        type="button"
        variant="outline"
        className="w-full h-11 border-2"
        onClick={onGoogleLogin}
        disabled={loading}
      >
        <GoogleIcon className="mr-2 h-5 w-5" />
        <span className="font-medium">Продолжить через Google</span>
      </Button>

      {/* Разделитель */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">или</span>
        </div>
      </div>

      {/* Email OTP */}
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="otp-email">Email</Label>
          <Input
            id="otp-email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="your@email.com"
            required
            disabled={loading}
            autoComplete="email"
          />
          <p className="text-xs text-muted-foreground">Мы отправим одноразовый код для входа</p>
        </div>

        <AuthAlert error={error} success={success} />

        <Button
          type="submit"
          disabled={loading}
          className="w-full"
          variant={email ? 'default' : 'secondary'}
        >
          {loading ? 'Отправка...' : 'Получить код на email'}
        </Button>
      </form>

      {/* Ссылка на логин/пароль */}
      <div className="pt-4">
        <button
          type="button"
          onClick={onShowPasswordForm}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto block"
        >
          Вход через логин и пароль
        </button>
      </div>
    </div>
  )
}
