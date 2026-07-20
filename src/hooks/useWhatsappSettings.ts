"use client"

/**
 * Настройки «показывать имя отправителя» по каналам (уровень воркспейса).
 * Когда включено — в исходящих подставляется имя сотрудника-автора (клиент
 * видит, кто написал). Имя = `participants.messenger_name ?? обычное имя`.
 * Применяется в telegram-send-message / wazzup-send / waha-send.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'

export type SenderNameChannel = 'telegram' | 'wazzup' | 'waha'
type Row = {
  telegram_show_sender_name: boolean
  wazzup_show_sender_name: boolean
  waha_show_sender_name: boolean
}
const COLUMN: Record<SenderNameChannel, keyof Row> = {
  telegram: 'telegram_show_sender_name',
  wazzup: 'wazzup_show_sender_name',
  waha: 'waha_show_sender_name',
}

const settingsKey = (workspaceId: string | undefined) =>
  ['workspace-sender-name-settings', workspaceId ?? ''] as const

export function useSenderNameSettings(workspaceId: string | undefined) {
  return useQuery({
    queryKey: settingsKey(workspaceId),
    enabled: !!workspaceId,
    queryFn: async (): Promise<Row> => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('telegram_show_sender_name, wazzup_show_sender_name, waha_show_sender_name')
        .eq('id', workspaceId!)
        .single()
      if (error) throw error
      const r = data as Row
      return {
        telegram_show_sender_name: r.telegram_show_sender_name ?? false,
        wazzup_show_sender_name: r.wazzup_show_sender_name ?? false,
        waha_show_sender_name: r.waha_show_sender_name ?? false,
      }
    },
  })
}

export function useUpdateSenderNameSetting(workspaceId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ channel, value }: { channel: SenderNameChannel; value: boolean }) => {
      if (!workspaceId) throw new Error('workspaceId required')
      const { error } = await supabase
        .from('workspaces')
        .update({ [COLUMN[channel]]: value })
        .eq('id', workspaceId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKey(workspaceId) })
      toast.success('Сохранено')
    },
    onError: (e: unknown) => toast.error(getUserFacingErrorMessage(e, 'Ошибка сохранения')),
  })
}
