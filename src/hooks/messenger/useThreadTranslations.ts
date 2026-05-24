"use client"

/**
 * Батч-загрузка кэшированных переводов сообщений треда на целевой язык юзера.
 * Один запрос на тред — MessageBubble через `select` достаёт нужную строку.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { STALE_TIME, GC_TIME } from '@/hooks/queryKeys'

export type MessageTranslation = {
  message_id: string
  translated_content: string
  target_language: string
  source_language: string | null
  model: string | null
}

export const threadTranslationsKey = (threadId: string | undefined, lang: string | undefined) =>
  ['thread-translations', threadId ?? '', lang ?? ''] as const

export function useThreadTranslations(
  threadId: string | undefined,
  targetLanguage: string | undefined,
) {
  return useQuery({
    queryKey: threadTranslationsKey(threadId, targetLanguage),
    queryFn: async (): Promise<MessageTranslation[]> => {
      if (!threadId || !targetLanguage) return []
      // PostgREST inner-join: фильтр по project_messages.thread_id даёт только
      // переводы для сообщений этого треда. RLS на message_translations + RLS
      // на project_messages дополнительно отсекут чужое.
      const { data, error } = await supabase
        .from('message_translations')
        .select('message_id, translated_content, target_language, source_language, model, project_messages!inner(thread_id)')
        .eq('target_language', targetLanguage)
        .eq('project_messages.thread_id', threadId)
      if (error) throw error
      return ((data ?? []) as Array<MessageTranslation & { project_messages: unknown }>).map(
        ({ project_messages: _pm, ...rest }) => rest,
      )
    },
    enabled: !!threadId && !!targetLanguage,
    staleTime: STALE_TIME.STANDARD,
    gcTime: GC_TIME.STANDARD,
  })
}

/** Вернуть функцию для инвалидации кэша переводов треда (после мутации). */
export function useInvalidateThreadTranslations() {
  const qc = useQueryClient()
  return useCallback(
    (threadId: string | undefined, targetLanguage: string | undefined) => {
      if (!threadId || !targetLanguage) return
      qc.invalidateQueries({ queryKey: threadTranslationsKey(threadId, targetLanguage) })
    },
    [qc],
  )
}
