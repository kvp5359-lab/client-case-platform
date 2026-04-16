"use client"

/**
 * useAudioPlaybackRate — персистентная скорость проигрывания аудио-вложений.
 *
 * Хранится в user_settings.audio_playback_rate и общая для всех плееров.
 * Кеш react-query (ключ userSettingsKeys.byUser) один на всех подписчиков —
 * поэтому при смене скорости в одном плеере значение моментально применяется
 * к остальным без отдельной инвалидации.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { userSettingsKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { Database } from '@/types/database'

type UserSettings = Database['public']['Tables']['user_settings']['Row']

/** Разрешённые скорости — шаг 0.25 от 0.75x до 2x. */
export const AUDIO_PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const

export const DEFAULT_AUDIO_PLAYBACK_RATE = 1

export function useAudioPlaybackRate() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const userId = user?.id

  const { data: settings, isLoading } = useQuery({
    queryKey: userSettingsKeys.byUser(userId ?? ''),
    queryFn: async () => {
      if (!userId) return null
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return (data as UserSettings | null) ?? null
    },
    enabled: !!userId,
    staleTime: STALE_TIME.LONG,
  })

  const rate = settings?.audio_playback_rate ?? DEFAULT_AUDIO_PLAYBACK_RATE

  const mutation = useMutation({
    mutationFn: async (next: number) => {
      if (!userId) throw new Error('Unauthorized')
      const { error } = await supabase
        .from('user_settings')
        .upsert(
          { user_id: userId, audio_playback_rate: next },
          { onConflict: 'user_id' },
        )
      if (error) throw error
    },
    onMutate: async (next: number) => {
      if (!userId) return
      const key = userSettingsKeys.byUser(userId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<UserSettings | null>(key)
      queryClient.setQueryData<UserSettings | null>(key, (old) =>
        old
          ? { ...old, audio_playback_rate: next }
          : ({ audio_playback_rate: next } as UserSettings),
      )
      return { previous }
    },
    onError: (_err, _next, ctx) => {
      if (!userId) return
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(userSettingsKeys.byUser(userId), ctx.previous)
      }
    },
  })

  const setRate = (next: number) => {
    mutation.mutate(next)
  }

  /** Циклически переключает на следующую скорость из AUDIO_PLAYBACK_SPEEDS. */
  const cycleRate = () => {
    const idx = AUDIO_PLAYBACK_SPEEDS.indexOf(rate as typeof AUDIO_PLAYBACK_SPEEDS[number])
    const nextIdx = idx === -1 ? 0 : (idx + 1) % AUDIO_PLAYBACK_SPEEDS.length
    setRate(AUDIO_PLAYBACK_SPEEDS[nextIdx])
  }

  return { rate, setRate, cycleRate, isLoading }
}
