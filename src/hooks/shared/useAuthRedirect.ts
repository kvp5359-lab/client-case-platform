"use client"

/**
 * useAuthRedirect — управляет таймером редиректа после успешной авторизации.
 * Используется в LoginForm и RegisterForm.
 */

import { useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function useAuthRedirect() {
  const router = useRouter()
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current)
    }
  }, [])

  /** Редирект немедленно — для email+password входа */
  const redirectNow = (path?: string) => {
    const redirectTo = path ?? localStorage.getItem('auth_redirect') ?? '/profile'
    localStorage.removeItem('auth_redirect')
    navigate(redirectTo)
  }

  /** Редирект с задержкой — для OTP-входа и регистрации */
  const redirectDelayed = (path?: string, delayMs = 500) => {
    const redirectTo = path ?? localStorage.getItem('auth_redirect') ?? '/profile'
    localStorage.removeItem('auth_redirect')
    redirectTimerRef.current = setTimeout(() => navigate(redirectTo), delayMs)
  }

  return { redirectNow, redirectDelayed }
}
