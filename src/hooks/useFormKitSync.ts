"use client"

/**
 * Hook для синхронизации анкеты с Google Sheets
 * Управляет синхронизацией и копированием ссылки на таблицу
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { formKitKeys } from '@/hooks/queryKeys'

interface UseFormKitSyncProps {
  formKitId: string
  projectId: string
  googleSheetId?: string | null
}

export function useFormKitSync({ formKitId, projectId, googleSheetId }: UseFormKitSyncProps) {
  const queryClient = useQueryClient()

  /**
   * Копирование ссылки на Google таблицу
   */
  const handleCopySheetLink = async () => {
    if (!googleSheetId) {
      toast.error('Сначала синхронизируйте анкету с Google Таблицей')
      return
    }

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${googleSheetId}/edit`

    try {
      await navigator.clipboard.writeText(sheetUrl)
      toast.success('Ссылка на таблицу скопирована в буфер обмена')
    } catch (err) {
      logger.error('Error copying to clipboard:', err)
      toast.error('Не удалось скопировать ссылку')
    }
  }

  /**
   * Синхронизация с Google Таблицей (useMutation — защита от двойного клика)
   */
  const syncMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Необходима авторизация')
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60_000)

      let response: Response
      try {
        response = await fetch(`${supabaseUrl}/functions/v1/google-sheets-sync-form`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify({ formKitId, projectId }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Sync failed (${response.status}): ${text.slice(0, 200)}`)
      }

      const data = await response.json()
      if (data?.error) {
        throw new Error(data.error)
      }

      return data as { spreadsheetUrl?: string }
    },
    onSuccess: (data) => {
      toast.success('Анкета синхронизирована с Google Таблицей')
      queryClient.invalidateQueries({ queryKey: formKitKeys.byId(formKitId) })

      if (data?.spreadsheetUrl) {
        window.open(data.spreadsheetUrl, '_blank', 'noopener,noreferrer')
      }
    },
    onError: (err) => {
      logger.error('Error syncing to Google Sheets:', err)
      toast.error(err instanceof Error ? err.message : 'Не удалось синхронизировать анкету')
    },
  })

  const handleSyncToGoogleSheets = () => {
    if (!projectId || !formKitId) return
    syncMutation.mutate()
  }

  return {
    isSyncing: syncMutation.isPending,
    handleCopySheetLink,
    handleSyncToGoogleSheets,
  }
}
