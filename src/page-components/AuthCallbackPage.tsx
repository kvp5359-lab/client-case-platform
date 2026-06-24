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
import { supabase } from '@/lib/supabase'
import { safeRedirectUrl } from '@/hooks/shared/useAuthRedirect'

export function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()

  // Обмениваем code на сессию (PKCE flow для Google OAuth)
  useEffect(() => {
    const code = searchParams.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).catch(() => {
        router.replace('/login')
      })
    }
  }, [searchParams, router])

  useEffect(() => {
    if (loading) return
    if (!user) return

    const next = searchParams.get('next')
    // safeRedirectUrl пропускает абсолютные URL на *.clientcase.app (поддомен
    // воркспейса), а не только относительные пути — иначе привязка к воркспейсу
    // из ссылки терялась и пользователя кидало на выбор воркспейса.
    const safeNext = next ? safeRedirectUrl(next) : (localStorage.getItem('auth_redirect') || '/app')
    localStorage.removeItem('auth_redirect')
    if (/^https?:\/\//i.test(safeNext)) {
      // Кросс-доменный возврат на поддомен воркспейса — полная перезагрузка
      window.location.href = safeNext
    } else {
      router.replace(safeNext)
    }
  }, [user, loading, router, searchParams])

  return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-muted-foreground">Выполняется вход...</p>
    </div>
  )
}
