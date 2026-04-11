"use client"

/**
 * Register Form — форма регистрации
 */

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GoogleIcon } from '@/components/ui/google-icon'
import { useAuthLockout } from './useAuthLockout'
import { useGoogleAuth } from './useGoogleAuth'
import { useAuthRedirect } from '@/hooks/shared/useAuthRedirect'

export function RegisterForm() {
  const { signUp, signInWithGoogle, loading: authLoading } = useAuth()
  const router = useRouter()
  const { redirectDelayed } = useAuthRedirect()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Клиентский lockout после неудачных попыток регистрации
  const {
    isLocked,
    remainingSeconds: registerLockout,
    recordFailedAttempt,
    resetAttempts,
  } = useAuthLockout({ storagePrefix: 'register' })

  // Google OAuth
  const { handleGoogleLogin: googleLogin, googleLoading } = useGoogleAuth({
    signInWithGoogle,
    onError: (msg) => {
      setError(msg)
    },
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (isLocked) return
    setError(null)

    // Валидация
    if (password !== passwordConfirm) {
      setError('Пароли не совпадают')
      return
    }

    if (password.length < 8) {
      setError('Пароль должен быть минимум 8 символов')
      return
    }

    setLoading(true)

    const { error } = await signUp(email, password)

    if (error) {
      const locked = recordFailedAttempt()
      if (locked) {
        setError('Слишком много попыток. Подождите 30 секунд')
      } else {
        setError(error.message)
      }
      setLoading(false)
    } else {
      resetAttempts()
      setSuccess(true)
      setLoading(false)
      // Автоматический редирект на login через 2 секунды
      redirectDelayed('/login', 2000)
    }
  }

  const handleGoogleLogin = async () => {
    setError(null)
    await googleLogin()
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="text-4xl">✅</div>
              <h2 className="text-2xl font-bold text-green-600">Регистрация успешна!</h2>
              <p className="text-gray-600">Вы можете войти в систему</p>
              <p className="text-sm text-gray-500">Перенаправление на страницу входа...</p>
              <Button onClick={() => router.push('/login')} className="w-full mt-4">
                Перейти ко входу
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Регистрация</CardTitle>
          <CardDescription>Создайте новый аккаунт</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={loading || authLoading || googleLoading}
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Минимум 8 символов"
                required
                disabled={loading || authLoading || googleLoading}
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password-confirm">Подтвердите пароль</Label>
              <Input
                id="password-confirm"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="Повторите пароль"
                required
                disabled={loading || authLoading || googleLoading}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || authLoading || googleLoading || isLocked}
              className="w-full"
            >
              {loading || authLoading
                ? 'Регистрация...'
                : isLocked
                  ? `Подождите ${registerLockout} сек`
                  : 'Зарегистрироваться'}
            </Button>

            <div className="space-y-2 pt-4 border-t">
              <p className="text-center text-sm text-muted-foreground">
                Или зарегистрируйтесь через
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogleLogin}
                disabled={loading || authLoading || googleLoading}
              >
                <GoogleIcon className="mr-2 h-4 w-4" />
                Войти через Google
              </Button>
            </div>

            <p className="text-center text-sm text-gray-600">
              Уже есть аккаунт?{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Войти
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
