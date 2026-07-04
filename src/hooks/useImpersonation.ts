"use client"

/**
 * Хук для управления режимом «войти под пользователем».
 *
 * Источник правды о состоянии — текущий JWT (claim app_metadata.impersonated_by).
 * При старте: бэкапим оригинальную сессию владельца → дёргаем edge function
 * impersonate-start → setSession(impersonation_token) → reload.
 * При выходе: восстанавливаем оригинальную сессию → reload.
 *
 * Триггер БД prevent_writes_during_impersonation блокирует все DML под
 * импersonационным JWT — поэтому фронт ничего не должен записывать сам.
 */

import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import {
  backupOriginalSession,
  clearOriginalSessionBackup,
  decodeJwtPayload,
  getImpersonationClaim,
  readOriginalSessionBackup,
} from '@/lib/impersonation'

export type ImpersonationState = {
  isActive: boolean
  ownerId: string | null
  sessionId: string | null
  targetUserId: string | null
  targetEmail: string | null
  expiresAt: number | null
  start: (params: { workspaceId: string; targetUserId: string }) => Promise<void>
  end: () => Promise<void>
}

import type { ImpersonateStartResponse as StartResponse } from '@/types/edgeContracts'

export function useImpersonation(): ImpersonationState {
  const { session } = useAuth()
  const queryClient = useQueryClient()

  const claim = useMemo(() => getImpersonationClaim(session), [session])

  const payload = useMemo(
    () => (session?.access_token ? decodeJwtPayload(session.access_token) : null),
    [session],
  )

  const start = useCallback(
    async ({ workspaceId, targetUserId }: { workspaceId: string; targetUserId: string }) => {
      if (!session) {
        toast.error('Нужна активная сессия')
        return
      }
      if (claim) {
        toast.error('Уже находитесь в режиме просмотра под другим пользователем')
        return
      }

      // Бэкап оригинальной сессии владельца — сделать ДО setSession.
      backupOriginalSession(session)

      const { data, error } = await supabase.functions.invoke<StartResponse>(
        'impersonate-start',
        { body: { workspace_id: workspaceId, target_user_id: targetUserId } },
      )
      if (error || !data) {
        clearOriginalSessionBackup()
        toast.error(getUserFacingErrorMessage(error, 'Не удалось войти под пользователем'))
        return
      }

      // Подменяем сессию. Передаём данный access_token как «refresh_token» —
      // супабейс отказывается принимать пустой refresh_token (AuthSessionMissingError).
      // Реального refresh не будет: импersonационный токен короткоживущий, баннер
      // авто-выходит до истечения, а если попытается обновиться — сессия просто
      // погасится, что эквивалентно ручному выходу.
      const { error: setErr } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.access_token,
      })
      if (setErr) {
        clearOriginalSessionBackup()
        toast.error(getUserFacingErrorMessage(setErr, 'Не удалось активировать сессию'))
        return
      }

      // React Query кеш очистить, чтобы не показывать чужие данные владельца.
      queryClient.clear()

      // Дожидаемся, что новая сессия точно записалась в cookies/localStorage.
      // setSession резолвится до завершения async-записи в @supabase/ssr,
      // и без этого вызов location.replace может реалоднуться раньше, чем
      // SSR-middleware на /login увидит новые cookies → пользователь
      // получает экран входа.
      await supabase.auth.getSession()

      const targetName =
        data.target.name && data.target.last_name
          ? `${data.target.name} ${data.target.last_name}`
          : data.target.name ?? data.target.email
      toast.success(`Вы вошли под пользователем: ${targetName}`)

      // Полный перезагруз — самый надёжный способ перезапустить все хуки/realtime/SSR.
      window.location.replace('/')
    },
    [session, claim, queryClient],
  )

  const end = useCallback(async () => {
    const sessionId = claim?.sessionId
    if (sessionId) {
      // Best-effort, не блокируем выход на ошибке.
      try {
        await supabase.functions.invoke('impersonate-end', {
          body: { session_id: sessionId },
        })
      } catch {
        /* ignore */
      }
    }

    const backup = readOriginalSessionBackup()
    if (backup?.access_token && backup.refresh_token) {
      const { error: restoreErr } = await supabase.auth.setSession({
        access_token: backup.access_token,
        refresh_token: backup.refresh_token,
      })
      clearOriginalSessionBackup()
      if (restoreErr) {
        // Если не удалось восстановить — выходим начисто.
        await supabase.auth.signOut()
        window.location.href = '/login'
        return
      }
    } else {
      // Бэкапа нет (редкий кейс) — просто разлогинить.
      await supabase.auth.signOut()
      window.location.href = '/login'
      return
    }

    queryClient.clear()
    toast.success('Вышли из режима просмотра')
    window.location.href = '/'
  }, [claim, queryClient])

  return {
    isActive: !!claim,
    ownerId: claim?.ownerId ?? null,
    sessionId: claim?.sessionId ?? null,
    targetUserId: (payload?.sub as string | undefined) ?? null,
    targetEmail: (payload?.email as string | undefined) ?? null,
    expiresAt: (payload?.exp as number | undefined) ?? null,
    start,
    end,
  }
}
