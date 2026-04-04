"use client"

/**
 * Login Form — современная форма входа
 *
 * Приоритеты авторизации:
 * 1. Google OAuth (основной способ)
 * 2. Email OTP (код на email)
 * 3. Email + Password (скрытая ссылка, для legacy пользователей)
 */

import { useState, useEffect, FormEvent } from 'react'
import Link from 'next/link'
import { useAuth } from '../../contexts/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { OtpEmailStep } from './OtpEmailStep'
import { OtpCodeStep } from './OtpCodeStep'
import { EmailPasswordStep } from './EmailPasswordStep'
import { useAuthLockout } from './useAuthLockout'
import { useGoogleAuth } from './useGoogleAuth'
import { useAuthRedirect } from '@/hooks/shared/useAuthRedirect'

export function LoginForm() {
  const { signIn, signInWithGoogle, signInWithOtp, verifyOtp, loading: authLoading } = useAuth()
  const { redirectNow, redirectDelayed } = useAuthRedirect()

  // Email + Password
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Email OTP
  const [otpEmail, setOtpEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpStep, setOtpStep] = useState<'email' | 'code'>('email')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [showPasswordForm, setShowPasswordForm] = useState(false)

  // Z1-02: Клиентский lockout после неудачных попыток входа по паролю
  const {
    isLocked: isPasswordLocked,
    remainingSeconds: passwordLockout,
    recordFailedAttempt,
    resetAttempts,
  } = useAuthLockout({ storagePrefix: 'login' })

  // Google OAuth
  const { handleGoogleLogin: googleLogin, googleLoading } = useGoogleAuth({
    signInWithGoogle,
    onError: (msg) => {
      setError(msg)
    },
  })

  const handleGoogleLogin = async () => {
    setError(null)
    setSuccess(null)
    await googleLogin()
  }

  const isLoading = loading || authLoading || googleLoading

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const handleEmailPasswordSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (isPasswordLocked) return
    setError(null)
    setSuccess(null)
    setLoading(true)

    const { error } = await signIn(email, password)
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
      setSuccess('✅ Успешный вход!')
      setLoading(false)
      redirectNow()
    }
  }

  const handleSendOtpCode = async (e?: FormEvent) => {
    e?.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    const { error } = await signInWithOtp(otpEmail)
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess('✅ Код отправлен на ваш email!')
      setOtpStep('code')
      setCooldown(60)
      setLoading(false)
    }
  }

  const handleVerifyOtpCode = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    const { error } = await verifyOtp(otpEmail, otpCode)
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess('✅ Успешный вход!')
      setLoading(false)
      redirectDelayed()
    }
  }

  const handleBackToEmail = () => {
    setOtpStep('email')
    setOtpCode('')
    setError(null)
    setSuccess(null)
  }

  const renderContent = () => {
    if (showPasswordForm) {
      return (
        <EmailPasswordStep
          email={email}
          password={password}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onSubmit={handleEmailPasswordSubmit}
          onBack={() => setShowPasswordForm(false)}
          error={error}
          success={success}
          loading={isLoading}
          lockout={passwordLockout}
        />
      )
    }

    if (otpStep === 'code') {
      return (
        <OtpCodeStep
          code={otpCode}
          email={otpEmail}
          onCodeChange={setOtpCode}
          onSubmit={handleVerifyOtpCode}
          onBack={handleBackToEmail}
          onResend={() => handleSendOtpCode()}
          error={error}
          success={success}
          loading={isLoading}
          cooldown={cooldown}
        />
      )
    }

    return (
      <OtpEmailStep
        email={otpEmail}
        onEmailChange={setOtpEmail}
        onSubmit={handleSendOtpCode}
        onGoogleLogin={handleGoogleLogin}
        onShowPasswordForm={() => setShowPasswordForm(true)}
        error={error}
        success={success}
        loading={isLoading}
      />
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Вход в систему</CardTitle>
          <CardDescription>
            {showPasswordForm ? 'Введите ваш email и пароль' : 'Войдите, чтобы продолжить работу'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {renderContent()}

          {/* Регистрация */}
          <div className="pt-6 border-t mt-6">
            <p className="text-center text-sm text-muted-foreground">
              Нет аккаунта?{' '}
              <Link href="/register" className="font-medium text-primary hover:underline">
                Зарегистрироваться
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
