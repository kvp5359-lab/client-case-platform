"use client"

/**
 * Protected Route — защищённый роут
 *
 * Если пользователь НЕ авторизован — перенаправляет на /login
 * Если авторизован — показывает компонент
 */

import { ReactNode, useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'

interface ProtectedRouteProps {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!loading && !user) {
      const fullPath = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '')
      if (fullPath !== '/' && fullPath !== '/profile' && fullPath !== '/app') {
        localStorage.setItem('auth_redirect', fullPath)
      }
      router.replace('/login')
    }
  }, [loading, user, router, pathname, searchParams])

  // Показываем загрузку пока проверяем авторизацию
  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    )
  }

  // Пользователь авторизован — показываем контент
  return <>{children}</>
}
