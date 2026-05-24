"use client"

/**
 * Настройки перевода сообщений на уровне воркспейса:
 *  - translation_model: модель LLM для translate-message (override ai_model).
 *  - translation_use_thread_context: подмешивать последние сообщения треда
 *    в системный промпт для согласованности перевода.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export interface TranslationSettings {
  translation_model: string | null
  translation_use_thread_context: boolean
}

const settingsKey = (workspaceId: string | undefined) =>
  ['workspace-translation-settings', workspaceId ?? ''] as const

export function useTranslationSettings(workspaceId: string | undefined) {
  return useQuery({
    queryKey: settingsKey(workspaceId),
    queryFn: async (): Promise<TranslationSettings> => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('translation_model, translation_use_thread_context')
        .eq('id', workspaceId!)
        .single()
      if (error) throw error
      return {
        translation_model: (data as { translation_model: string | null }).translation_model ?? null,
        translation_use_thread_context:
          (data as { translation_use_thread_context: boolean }).translation_use_thread_context ?? false,
      }
    },
    enabled: !!workspaceId,
  })
}

export function useUpdateTranslationSettings(workspaceId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<TranslationSettings>) => {
      if (!workspaceId) throw new Error('workspaceId required')
      const { error } = await supabase
        .from('workspaces')
        .update(patch)
        .eq('id', workspaceId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKey(workspaceId) })
      toast.success('Сохранено')
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Ошибка сохранения')
    },
  })
}
