"use client"

/**
 * TechnicalAdminRoute Component
 * Защита роутов для технического администратора
 *
 * Email-адреса техадминов хранятся в NEXT_PUBLIC_ переменной (видна в бандле).
 * Это намеренно — проверка здесь только для UI-навигации.
 * Серверная проверка прав осуществляется через RLS и Edge Functions.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'

const TECHNICAL_ADMIN_EMAILS = (process.env.NEXT_PUBLIC_TECHNICAL_ADMIN_EMAILS || '')
  .split(',')
  .map((email: string) => email.trim().toLowerCase())
  .filter(Boolean)

interface TechnicalAdminRouteProps {
  children: React.ReactNode
}

export function TechnicalAdminRoute({ children }: TechnicalAdminRouteProps) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && (!user || !TECHNICAL_ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? ''))) {
      router.replace('/profile')
    }
  }, [loading, user, router])

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!user || !TECHNICAL_ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? '')) {
    return null
  }

  return <>{children}</>
}
