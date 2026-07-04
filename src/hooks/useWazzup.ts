"use client"

/**
 * Хуки для интеграции Wazzup (WhatsApp / Instagram через wazzup24.com).
 *
 * - useWazzupSettings — настройки воркспейса (api_key, webhook_secret).
 * - useUpsertWazzupSettings — сохранить/обновить API-ключ.
 * - useWazzupChannels — список каналов (номеров) воркспейса.
 * - useFetchWazzupChannels — синхронизация с REST Wazzup (Edge Function).
 * - useAssignWazzupChannelUser — привязать канал к сотруднику.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import { wazzupKeys } from '@/hooks/queryKeys'

export type WazzupSettings = {
  workspace_id: string
  api_key: string
  webhook_secret: string
  updated_at: string | null
}

export type WazzupChannel = {
  id: string
  workspace_id: string
  user_id: string | null
  channel_id: string
  transport: string
  name: string | null
  phone: string | null
  state: string | null
  is_active: boolean
  last_synced_at: string | null
}

export function useWazzupSettings(workspaceId: string | undefined) {
  return useQuery<WazzupSettings | null>({
    queryKey: wazzupKeys.settings(workspaceId ?? ''),
    queryFn: async () => {
      if (!workspaceId) return null
      const { data, error } = await supabase
        .from('wazzup_settings')
        .select('workspace_id, api_key, webhook_secret, updated_at')
        .eq('workspace_id', workspaceId)
        .maybeSingle()
      if (error) throw error
      return (data as WazzupSettings | null) ?? null
    },
    enabled: !!workspaceId,
  })
}

export function useUpsertWazzupSettings(workspaceId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (apiKey: string) => {
      if (!workspaceId) throw new Error('workspace_id required')
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('wazzup_settings')
        .upsert(
          {
            workspace_id: workspaceId,
            api_key: apiKey,
            created_by: user?.id ?? null,
          },
          { onConflict: 'workspace_id' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wazzupKeys.settings(workspaceId ?? '') })
      toast.success('Wazzup-ключ сохранён')
    },
    onError: (err: Error) => {
      toast.error(getUserFacingErrorMessage(err, 'Не удалось сохранить ключ'))
    },
  })
}

export function useWazzupChannels(workspaceId: string | undefined) {
  return useQuery<WazzupChannel[]>({
    queryKey: wazzupKeys.channels(workspaceId ?? ''),
    queryFn: async () => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('wazzup_channels')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as WazzupChannel[]
    },
    enabled: !!workspaceId,
  })
}

/** Установить наш webhook в Wazzup через их REST API. */
export function useSetWazzupWebhook(workspaceId: string | undefined) {
  return useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error('workspace_id required')
      const { data, error } = await supabase.functions.invoke('wazzup-set-webhook', {
        body: { workspace_id: workspaceId },
      })
      if (error) throw new Error(error.message)
      return data as { ok: boolean; webhookUrl: string }
    },
    onSuccess: () => {
      toast.success('Webhook подписан в Wazzup')
    },
    onError: (err: Error) => {
      toast.error(getUserFacingErrorMessage(err, 'Не удалось подписать webhook'))
    },
  })
}

/** Синхронизация каналов с Wazzup REST через нашу Edge Function. */
export function useFetchWazzupChannels(workspaceId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error('workspace_id required')
      const { data, error } = await supabase.functions.invoke('wazzup-fetch-channels', {
        body: { workspace_id: workspaceId },
      })
      if (error) throw new Error(error.message)
      return data as { ok: boolean; count: number }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: wazzupKeys.channels(workspaceId ?? '') })
      qc.invalidateQueries({ queryKey: wazzupKeys.myChannelsByWorkspace(workspaceId ?? '') })
      toast.success(`Загружено каналов: ${result.count}`)
    },
    onError: (err: Error) => {
      toast.error(getUserFacingErrorMessage(err, 'Не удалось загрузить каналы'))
    },
  })
}

export function useAssignWazzupChannelUser(workspaceId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ channelDbId, userId }: { channelDbId: string; userId: string | null }) => {
      const { error } = await supabase
        .from('wazzup_channels')
        .update({ user_id: userId })
        .eq('id', channelDbId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wazzupKeys.channels(workspaceId ?? '') })
      // Личный список каналов сотрудника (в профиле) тоже зависит от привязки.
      qc.invalidateQueries({ queryKey: wazzupKeys.myChannelsByWorkspace(workspaceId ?? '') })
      toast.success('Канал привязан')
    },
    onError: (err: Error) => {
      toast.error(getUserFacingErrorMessage(err, 'Не удалось привязать'))
    },
  })
}

/** Полный URL для копирования в кабинет Wazzup. */
export function buildWazzupWebhookUrl(webhookSecret: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  return `${base}/functions/v1/wazzup-webhook?key=${webhookSecret}`
}
