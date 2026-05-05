"use client"

/**
 * useAuthRedirect — управляет редиректом после успешной авторизации.
 * Используется в LoginForm и RegisterForm.
 *
 * Источники next-URL (по приоритету):
 *  1. URL query-параметр `next` (от proxy: при редиректе на портал /login)
 *  2. localStorage 'auth_redirect'
 *  3. Дефолт `/app`
 *
 * Безопасность:
 *  - Относительные пути (начинаются с одного `/`, без `//`, `\`, `javascript:`).
 *  - Абсолютные URL допускаются ТОЛЬКО на clientcase.app или его поддоменах.
 */

import { useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const ROOT_DOMAIN = 'clientcase.app'

/**
 * Защита от open-redirect.
 * Возвращает безопасный URL (относительный или абсолютный на clientcase.app),
 * либо `/app` как дефолт.
 */
export function safeRedirectUrl(input: string | null | undefined): string {
  if (!input || typeof input !== 'string') return '/app'

  // Абсолютный URL (https://...)?
  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input)
      const host = url.hostname.toLowerCase()
      // Разрешаем только clientcase.app и его поддомены
      if (host === ROOT_DOMAIN || host.endsWith('.' + ROOT_DOMAIN)) {
        return input
      }
      // Также разрешаем текущий host (custom-домены и legacy)
      if (typeof window !== 'undefined' && host === window.location.hostname.toLowerCase()) {
        return input
      }
      return '/app'
    } catch {
      return '/app'
    }
  }

  // Относительный путь
  if (!input.startsWith('/')) return '/app'
  if (input.startsWith('//') || input.startsWith('/\\')) return '/app'
  const decoded = decodeURIComponent(input)
  if (decoded.startsWith('//') || decoded.startsWith('/\\')) return '/app'
  if (decoded.toLowerCase().includes('javascript:')) return '/app'
  return input
}

/** Backward-compat алиас (старое имя) */
export const safeInternalPath = safeRedirectUrl

/**
 * Достать next-URL: сначала из URL query, потом из localStorage.
 */
function pickNextUrl(explicit?: string): string {
  if (explicit) return safeRedirectUrl(explicit)
  if (typeof window !== 'undefined') {
    const fromQuery = new URLSearchParams(window.location.search).get('next')
    if (fromQuery) return safeRedirectUrl(fromQuery)
    const fromLs = localStorage.getItem('auth_redirect')
    if (fromLs) return safeRedirectUrl(fromLs)
  }
  return '/app'
}

function navigate(target: string, router: ReturnType<typeof useRouter>) {
  // Если абсолютный URL — full reload (cross-domain)
  if (/^https?:\/\//i.test(target)) {
    if (typeof window !== 'undefined') {
      window.location.href = target
    }
    return
  }
  router.push(target)
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
    const target = pickNextUrl(path)
    if (typeof window !== 'undefined') localStorage.removeItem('auth_redirect')
    navigate(target, router)
  }

  /** Редирект с задержкой — для OTP-входа и регистрации */
  const redirectDelayed = (path?: string, delayMs = 500) => {
    const target = pickNextUrl(path)
    if (typeof window !== 'undefined') localStorage.removeItem('auth_redirect')
    redirectTimerRef.current = setTimeout(() => navigate(target, router), delayMs)
  }

  return { redirectNow, redirectDelayed }
}
