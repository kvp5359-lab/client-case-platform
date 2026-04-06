"use client"

/**
 * useAuthRedirect — управляет таймером редиректа после успешной авторизации.
 * Используется в LoginForm и RegisterForm.
 */

import { useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Защита от open-redirect: принимаем только относительные пути,
 * начинающиеся с одного `/` (но не `//`, не `/\`, не `javascript:`).
 */
export function safeInternalPath(path: string | null | undefined): string {
  if (!path || typeof path !== 'string') return '/profile'
  if (!path.startsWith('/')) return '/profile'
  if (path.startsWith('//') || path.startsWith('/\\')) return '/profile'
  // Блокируем URL-encoded обходы и опасные протоколы
  const decoded = decodeURIComponent(path)
  if (decoded.startsWith('//') || decoded.startsWith('/\\')) return '/profile'
  if (decoded.toLowerCase().includes('javascript:')) return '/profile'
  return path
}

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
    const redirectTo = safeInternalPath(path ?? localStorage.getItem('auth_redirect'))
    localStorage.removeItem('auth_redirect')
    router.push(redirectTo)
  }

  /** Редирект с задержкой — для OTP-входа и регистрации */
  const redirectDelayed = (path?: string, delayMs = 500) => {
    const redirectTo = safeInternalPath(path ?? localStorage.getItem('auth_redirect'))
    localStorage.removeItem('auth_redirect')
    redirectTimerRef.current = setTimeout(() => router.push(redirectTo), delayMs)
  }

  return { redirectNow, redirectDelayed }
}
