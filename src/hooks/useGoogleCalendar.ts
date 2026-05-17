/**
 * Google Calendar integration: hooks for OAuth status, list, sync, disconnect.
 *
 * Архитектура: токены OAuth хранятся в `google_calendar_tokens` per user,
 * наша сущность «календарь» — таблица `calendars` (source='google' для
 * подключённых GCal или 'internal' для будущих внутренних). Edge Functions:
 *   - google-calendar-auth → возвращает authUrl для попапа
 *   - google-calendar-callback → exchange code → tokens
 *   - google-calendar-list → возвращает список Google-календарей юзера
 *   - google-calendar-sync → синхронизация конкретного календаря/всех
 */

import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

// ── Query keys ─────────────────────────────────────────────────────────────

export const googleCalendarKeys = {
  all: ['google-calendar'] as const,
  token: () => [...googleCalendarKeys.all, 'token'] as const,
  remoteList: () => [...googleCalendarKeys.all, 'remote-list'] as const,
  calendars: (workspaceId: string | undefined) =>
    [...googleCalendarKeys.all, 'calendars', workspaceId] as const,
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface GoogleCalendarToken {
  user_id: string
  google_email: string | null
  expires_at: string
}

export interface RemoteGoogleCalendar {
  id: string
  name: string
  description: string | null
  color: string
  primary: boolean
  access_role: string
}

export interface Calendar {
  id: string
  workspace_id: string
  name: string
  color: string
  source: 'internal' | 'google'
  google_account_user_id: string | null
  google_calendar_id: string | null
  owner_user_id: string | null
  is_visible: boolean
  is_deleted: boolean
}

// ── Hooks ──────────────────────────────────────────────────────────────────

/** Текущий статус подключения Google Calendar пользователем. */
export function useGoogleCalendarToken() {
  return useQuery({
    queryKey: googleCalendarKeys.token(),
    queryFn: async (): Promise<GoogleCalendarToken | null> => {
      const { data, error } = await supabase
        .from('google_calendar_tokens')
        .select('user_id, google_email, expires_at')
        .maybeSingle()
      if (error) throw error
      return (data as GoogleCalendarToken | null) ?? null
    },
  })
}

/** Список Google-календарей пользователя (с серверной стороны через edge function). */
export function useRemoteGoogleCalendars(enabled: boolean) {
  return useQuery({
    queryKey: googleCalendarKeys.remoteList(),
    enabled,
    queryFn: async (): Promise<RemoteGoogleCalendar[]> => {
      const { data, error } = await supabase.functions.invoke<{
        calendars: RemoteGoogleCalendar[]
      }>('google-calendar-list', { body: {} })
      if (error) throw error
      return data?.calendars ?? []
    },
  })
}

/** Календари нашей системы для воркспейса. */
export function useWorkspaceCalendars(workspaceId: string | undefined) {
  return useQuery({
    queryKey: googleCalendarKeys.calendars(workspaceId),
    enabled: !!workspaceId,
    queryFn: async (): Promise<Calendar[]> => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('calendars')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data as Calendar[]) ?? []
    },
  })
}

/** Открыть OAuth-попап для подключения Google Calendar. */
export function useConnectGoogleCalendar() {
  const queryClient = useQueryClient()

  return useCallback(async () => {
    const { data, error } = await supabase.functions.invoke<{ authUrl: string }>(
      'google-calendar-auth',
      { body: { origin: window.location.origin } },
    )
    if (error || !data?.authUrl) {
      toast.error('Не удалось начать OAuth')
      return
    }

    return new Promise<void>((resolve) => {
      const popup = window.open(data.authUrl, 'google-calendar-auth', 'width=520,height=640')
      const onMessage = (e: MessageEvent) => {
        if (e.data?.type === 'google-calendar-auth-success') {
          window.removeEventListener('message', onMessage)
          popup?.close()
          queryClient.invalidateQueries({ queryKey: googleCalendarKeys.token() })
          queryClient.invalidateQueries({ queryKey: googleCalendarKeys.remoteList() })
          toast.success('Google Calendar подключён')
          resolve()
        } else if (e.data?.type === 'google-calendar-auth-error') {
          window.removeEventListener('message', onMessage)
          popup?.close()
          toast.error(`Ошибка подключения: ${e.data?.error ?? 'unknown'}`)
          resolve()
        }
      }
      window.addEventListener('message', onMessage)
    })
  }, [queryClient])
}

/** Отключить Google Calendar (удалить токены). */
export function useDisconnectGoogleCalendar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      // RLS: пользователь может удалить только свои токены.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('google_calendar_tokens')
        .delete()
        .eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: googleCalendarKeys.token() })
      queryClient.invalidateQueries({ queryKey: googleCalendarKeys.remoteList() })
      toast.success('Google Calendar отключён')
    },
    onError: (e) => toast.error(`Не удалось отключить: ${e instanceof Error ? e.message : 'ошибка'}`),
  })
}

/** Добавить календарь нашей системы (internal или привязка к Google). */
export function useCreateCalendar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      workspace_id: string
      name: string
      color: string
      source: 'internal' | 'google'
      google_calendar_id?: string | null
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const insertData = {
        workspace_id: params.workspace_id,
        name: params.name,
        color: params.color,
        source: params.source,
        owner_user_id: user.id,
        google_account_user_id: params.source === 'google' ? user.id : null,
        google_calendar_id: params.source === 'google' ? params.google_calendar_id ?? null : null,
      }

      const { data, error } = await supabase
        .from('calendars')
        .insert(insertData)
        .select()
        .single()
      if (error) throw error
      return data as Calendar
    },
    onSuccess: (cal) => {
      queryClient.invalidateQueries({ queryKey: googleCalendarKeys.calendars(cal.workspace_id) })
      // Сразу триггерим sync для нового календаря (если он Google).
      if (cal.source === 'google') {
        supabase.functions
          .invoke('google-calendar-sync', { body: { calendar_id: cal.id } })
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['external-calendar-events'] })
          })
          .catch((e) => console.warn('[calendar-sync] initial sync failed:', e))
      }
    },
  })
}

/** Удалить календарь нашей системы. */
export function useDeleteCalendar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('calendars').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: googleCalendarKeys.all })
    },
  })
}

/** Ручной запуск sync для конкретного календаря (кнопка «обновить»). */
export function useSyncCalendar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (calendarId: string) => {
      const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
        body: { calendar_id: calendarId },
      })
      if (error) throw error
      return data as { results: Array<{ calendar_id: string; upserted: number; deleted: number; error?: string }> }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-calendar-events'] })
    },
  })
}
