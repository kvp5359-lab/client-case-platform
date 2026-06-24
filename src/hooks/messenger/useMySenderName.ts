"use client"

import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'

/**
 * Отображаемое имя текущего пользователя в воркспейсе — ровно в том формате,
 * в котором RPC `get_inbox_threads_v2` отдаёт `last_sender_name`:
 * `TRIM(name || ' ' || last_name)`.
 *
 * Нужно, чтобы в превью «Входящих» заменить своё имя отправителя на «Я».
 * Сравнение по имени (а не по user_id) — потому что карантинная RPC не отдаёт
 * id отправителя, а расширять её = DROP+CREATE 7 функций (см. messenger-ledger).
 */
export function useMySenderName(workspaceId: string | undefined): string | null {
  const { user } = useAuth()
  const { data: participants } = useWorkspaceParticipants(workspaceId)

  return useMemo(() => {
    if (!user || !participants) return null
    const me = participants.find((p) => p.user_id === user.id)
    if (!me) return null
    return `${me.name ?? ''} ${me.last_name ?? ''}`.trim() || null
  }, [user, participants])
}
