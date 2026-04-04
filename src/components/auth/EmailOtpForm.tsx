"use client"

/**
 * Email OTP Form — авторизация через код на email
 * Упрощённый вариант без Google OAuth (для прямого роута /login/email)
 * Переиспользует OtpCodeStep для шага 2
 */

import { useState, useEffect, useRef, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail } from 'lucide-react'
import { AuthAlert } from './AuthAlert'
import { OtpCodeStep } from './OtpCodeStep'

export function EmailOtpForm() {
  const { signInWithOtp, verifyOtp, loading: authLoading } = useAuth()
  const router = useRouter()
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current)
    }
  }, [])

  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  const isLoading = loading || authLoading

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const handleSendCode = async (e?: FormEvent) => {
    e?.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    const { error: otpError } = await signInWithOtp(email)
    if (otpError) {
      setError(otpError.message)
    } else {
      setSuccess('Код отправлен на ваш email!')
      setStep('code')
      setCooldown(60)
    }
    setLoading(false)
  }

  const handleVerifyCode = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    const { error: verifyError } = await verifyOtp(email, code)
    if (verifyError) {
      setError(verifyError.message)
      setLoading(false)
    } else {
      setSuccess('Успешный вход!')
      setLoading(false)
      redirectTimerRef.current = setTimeout(() => router.push('/profile'), 500)
    }
  }

  const handleBackToEmail = () => {
    setStep('email')
    setCode('')
    setError(null)
    setSuccess(null)
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Вход по email
          </CardTitle>
          <CardDescription>
            {step === 'email'
              ? 'Введите email для получения кода подтверждения'
              : 'Введите код из письма'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'email' ? (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email адрес</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>

              <AuthAlert error={error} success={success} />

              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? 'Отправка...' : 'Получить код'}
              </Button>

              <div className="space-y-2 pt-4 border-t">
                <p className="text-center text-sm text-muted-foreground">
                  Или войдите другим способом
                </p>
                <Link href="/login">
                  <Button type="button" variant="outline" className="w-full">
                    Вход с паролем
                  </Button>
                </Link>
              </div>

              <p className="text-center text-sm text-muted-foreground">
                Нет аккаунта?{' '}
                <Link href="/register" className="font-medium text-primary hover:underline">
                  Зарегистрироваться
                </Link>
              </p>
            </form>
          ) : (
            <OtpCodeStep
              code={code}
              email={email}
              onCodeChange={setCode}
              onSubmit={handleVerifyCode}
              onBack={handleBackToEmail}
              onResend={() => handleSendCode()}
              error={error}
              success={success}
              loading={isLoading}
              cooldown={cooldown}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
