"use client"

/**
 * Auth Callback Page — обработка редиректа после Google OAuth
 *
 * Supabase автоматически парсит токены из URL hash/query.
 * После подтверждения сессии — редиректим на сохранённый URL или /profile.
 */

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (!user) return

    const next = searchParams.get('next')
    const safeNext = next?.startsWith('/') ? next : null
    const redirectTo = safeNext || localStorage.getItem('auth_redirect') || '/profile'
    localStorage.removeItem('auth_redirect')
    router.replace(redirectTo)
  }, [user, loading, router, searchParams])

  return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-muted-foreground">Выполняется вход...</p>
    </div>
  )
}
