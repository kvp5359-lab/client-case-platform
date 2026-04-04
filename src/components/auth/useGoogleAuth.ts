"use client"

/**
 * useGoogleAuth — общая логика Google OAuth для auth-форм
 * Инкапсулирует signInWithGoogle + страховочный таймер сброса loading.
 */

import { useState, useRef, useEffect, useCallback } from 'react'

interface UseGoogleAuthOptions {
  signInWithGoogle: (redirectTo?: string) => Promise<{ error: { message: string } | null }>
  onError?: (message: string) => void
}

interface UseGoogleAuthReturn {
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
    const savedRedirect = localStorage.getItem('auth_redirect')
    const { error } = await signInWithGoogle(savedRedirect || undefined)
    if (error) {
      onError?.(error.message)
      setGoogleLoading(false)
    } else {
      // Страховочный сброс loading — если редирект на Google не произошёл за 10 сек
      googleTimerRef.current = setTimeout(() => setGoogleLoading(false), 10000)
    }
  }, [signInWithGoogle, onError])

  return { handleGoogleLogin, googleLoading }
}
