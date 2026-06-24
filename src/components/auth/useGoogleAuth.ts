"use client"

/**
 * useGoogleAuth — общая логика Google OAuth для auth-форм
 * Инкапсулирует signInWithGoogle + страховочный таймер сброса loading.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { formatAuthError } from '@/lib/authErrors'

type UseGoogleAuthOptions = {
  signInWithGoogle: (redirectTo?: string) => Promise<{ error: { message: string } | null }>
  onError?: (message: string) => void
}

type UseGoogleAuthReturn = {
  handleGoogleLogin: () => Promise<void>
  googleLoading: boolean
}

export function useGoogleAuth({
  signInWithGoogle,
  onError,
}: UseGoogleAuthOptions): UseGoogleAuthReturn {
  const [googleLoading, setGoogleLoading] = useState(false)
  const googleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (googleTimerRef.current) clearTimeout(googleTimerRef.current)
    }
  }, [])

  const handleGoogleLogin = useCallback(async () => {
    setGoogleLoading(true)
    // Цель возврата: сначала ?next= из URL (proxy кладёт туда поддомен воркспейса
    // при редиректе rs.clientcase.app/login → my.clientcase.app/login), потом
    // localStorage. Без этого вход через Google терял привязку к воркспейсу.
    const fromQuery =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('next')
        : null
    const savedRedirect = fromQuery || localStorage.getItem('auth_redirect')
    const { error } = await signInWithGoogle(savedRedirect || undefined)
    if (error) {
      onError?.(formatAuthError(error as Error))
      setGoogleLoading(false)
    } else {
      // Страховочный сброс loading — если редирект на Google не произошёл за 10 сек
      googleTimerRef.current = setTimeout(() => setGoogleLoading(false), 10000)
    }
  }, [signInWithGoogle, onError])

  return { handleGoogleLogin, googleLoading }
}
