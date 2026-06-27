"use client"

/**
 * useNotificationMute — режим «тишина» (Do Not Disturb) по воркспейсу.
 *
 * Глушит всплывающие уведомления о новых сообщениях и звук (см.
 * useNewMessageToast). Состояние хранится на сервере (таблица
 * `notification_mute`), синхронизируется между устройствами.
 *
 * Модель: одна колонка `muted_until`.
 *   - нет строки / время в прошлом → уведомления включены
 *   - время в будущем            → заглушено до этого момента
 *   - год 9999 (FOREVER)         → заглушено «насовсем»
 *
 * Клиентский таймер сам «оживляет» уведомления, когда окно тишины истекает.
 */

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { notificationMuteKeys } from '@/hooks/queryKeys'

export type MutePreset = '30m' | '1h' | '4h' | 'morning' | 'forever'

/** Sentinel «насовсем» — конкретная дальняя дата (PostgREST 'infinity' плохо парсится в Date). */
const FOREVER_ISO = '9999-12-31T23:59:59.000Z'
const FOREVER_THRESHOLD_MS = Date.parse('9000-01-01T00:00:00.000Z')
/** Максимум для setTimeout (~24.8 дня) — дальше таймер не ставим, окна тишины короче. */
const MAX_TIMEOUT_MS = 2_147_483_647

function computeMuteUntil(preset: MutePreset): string {
  const now = Date.now()
  switch (preset) {
    case '30m':
      return new Date(now + 30 * 60_000).toISOString()
    case '1h':
      return new Date(now + 60 * 60_000).toISOString()
    case '4h':
      return new Date(now + 4 * 60 * 60_000).toISOString()
    case 'morning': {
      // Ближайшие 8:00 по локальному времени браузера, строго в будущем.
      const d = new Date()
      d.setHours(8, 0, 0, 0)
      if (d.getTime() <= now) d.setDate(d.getDate() + 1)
      return d.toISOString()
    }
    case 'forever':
      return FOREVER_ISO
  }
}

export function useNotificationMute(workspaceId: string | undefined) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const userId = user?.id

  const query = useQuery({
    queryKey: notificationMuteKeys.byWorkspace(workspaceId ?? '', userId),
    enabled: !!workspaceId && !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('notification_mute')
        .select('muted_until')
        .eq('workspace_id', workspaceId!)
        .eq('user_id', userId!)
        .maybeSingle()
      if (error) throw error
      return data?.muted_until ?? null
    },
  })

  const mutedUntilRaw = query.data ?? null
  const mutedUntilMs = mutedUntilRaw ? new Date(mutedUntilRaw).getTime() : null

  // isMuted держим в state и пересчитываем в эффекте/таймере — чтобы не звать
  // Date.now() во время рендера (impure) и чтобы окно тишины само «оживало»,
  // когда время вышло.
  const [isMuted, setIsMuted] = useState(false)
  useEffect(() => {
    const evaluate = () => {
      const muted =
        mutedUntilMs != null && Number.isFinite(mutedUntilMs) && mutedUntilMs > Date.now()
      setIsMuted(muted)
    }
    evaluate()
    if (mutedUntilMs == null || !Number.isFinite(mutedUntilMs)) return
    const ms = mutedUntilMs - Date.now()
    if (ms <= 0 || ms > MAX_TIMEOUT_MS) return // истекло / «насовсем» — таймер не нужен
    const t = setTimeout(evaluate, ms + 500)
    return () => clearTimeout(t)
  }, [mutedUntilMs])

  const isForever = isMuted && mutedUntilMs != null && mutedUntilMs >= FOREVER_THRESHOLD_MS

  const muteMutation = useMutation({
    mutationFn: async (preset: MutePreset): Promise<string> => {
      const until = computeMuteUntil(preset)
      const { error } = await supabase.from('notification_mute').upsert(
        {
          user_id: userId!,
          workspace_id: workspaceId!,
          muted_until: until,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,workspace_id' },
      )
      if (error) throw error
      return until
    },
    onSuccess: (until) => {
      qc.setQueryData(notificationMuteKeys.byWorkspace(workspaceId ?? '', userId), until)
    },
  })

  const unmuteMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await supabase
        .from('notification_mute')
        .delete()
        .eq('workspace_id', workspaceId!)
        .eq('user_id', userId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.setQueryData(notificationMuteKeys.byWorkspace(workspaceId ?? '', userId), null)
    },
  })

  return {
    /** Сейчас уведомления заглушены. */
    isMuted,
    /** До какого момента заглушено (null если включено). «Насовсем» → дальняя дата. */
    mutedUntil: isMuted ? new Date(mutedUntilMs!) : null,
    /** Заглушено «насовсем» (без таймера). */
    isForever,
    isLoading: query.isLoading,
    mute: (preset: MutePreset) => muteMutation.mutate(preset),
    unmute: () => unmuteMutation.mutate(),
    pending: muteMutation.isPending || unmuteMutation.isPending,
  }
}
