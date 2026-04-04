"use client"

/**
 * Форма входа по email + пароль (legacy)
 */

import { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthAlert } from './AuthAlert'

interface EmailPasswordStepProps {
  email: string
  password: string
  onEmailChange: (email: string) => void
  onPasswordChange: (password: string) => void
  onSubmit: (e: FormEvent) => void
  onBack: () => void
  error: string | null
  success: string | null
  loading: boolean
  lockout?: number
}

export function EmailPasswordStep({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onBack,
  error,
  success,
  loading,
  lockout = 0,
}: EmailPasswordStepProps) {
  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="your@email.com"
            required
            disabled={loading}
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Пароль</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="••••••••"
            required
            disabled={loading}
            autoComplete="current-password"
          />
        </div>

        <AuthAlert error={error} success={success} />

        <Button type="submit" disabled={loading || lockout > 0} className="w-full">
          {loading ? 'Вход...' : lockout > 0 ? `Подождите ${lockout} сек` : 'Войти'}
        </Button>
      </form>

      <button
        type="button"
        onClick={onBack}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto block"
      >
        ← Другие способы входа
      </button>
    </div>
  )
}
