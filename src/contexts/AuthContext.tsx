"use client"

/**
 * Auth Context — управление состоянием авторизации
 *
 * Предоставляет:
 * - Текущего пользователя (user)
 * - Методы: login, register, logout
 * - Загрузочное состояние (loading)
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
  ReactNode,
} from 'react'
import { User, AuthError, Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { safeInternalPath } from '@/hooks/shared/useAuthRedirect'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { useDocumentKitUIStore } from '@/store/documentKitUI/store'

// Типы для контекста
interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signInWithOtp: (email: string) => Promise<{ error: AuthError | null }>
  verifyOtp: (email: string, token: string) => Promise<{ error: AuthError | null }>
  signInWithGoogle: (nextPath?: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
}

// Создаём контекст
const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Provider компонент
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // onAuthStateChange вызывает callback с INITIAL_SESSION при подписке,
    // поэтому отдельный getSession() не нужен и избегаем race condition
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }, [])

  const signInWithOtp = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    return { error }
  }, [])

  const verifyOtp = useCallback(async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    return { error }
  }, [])

  const signInWithGoogle = useCallback(async (nextPath?: string) => {
    const callbackUrl = `${window.location.origin}/auth/callback`
    const safePath = nextPath ? safeInternalPath(nextPath) : null
    const redirectTo = safePath && safePath !== '/profile' && safePath !== '/app'
      ? `${callbackUrl}?next=${encodeURIComponent(safePath)}`
      : callbackUrl
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    queryClient.clear()
    // Чистим клиентские сторы, чтобы не осталось данных предыдущего пользователя
    // (AI-сессии, контекст страницы, состояние документ-кита, открытые чаты и т.п.)
    useSidePanelStore.getState().reset()
    useDocumentKitUIStore.getState().resetState()
  }, [queryClient])

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      signUp,
      signIn,
      signInWithOtp,
      verifyOtp,
      signInWithGoogle,
      signOut,
    }),
    [user, session, loading, signUp, signIn, signInWithOtp, verifyOtp, signInWithGoogle, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Хук для использования AuthContext
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
