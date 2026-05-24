"use client"

/**
 * Перевод сообщений через edge function `translate-message`.
 *
 * Два режима:
 *   - useTranslateMessage() — перевод существующего сообщения с кэшированием
 *     в БД (message_translations). Используется на входящих/любых сообщениях.
 *   - useTranslatePreview() — превью без сохранения. Используется в композере
 *     при отправке исходящих, до записи сообщения.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { threadTranslationsKey } from './useThreadTranslations'

/**
 * supabase.functions.invoke на non-2xx бросает FunctionsHttpError, в котором
 * сырое тело лежит в .context (Response). Достаём оттуда поле `error`,
 * которое edge function отдаёт человеческим текстом.
 */
async function extractFunctionError(err: unknown, fallback: string): Promise<string> {
  const ctx = (err as { context?: Response } | null)?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.clone().json()
      if (body && typeof body.error === 'string' && body.error.trim()) return body.error
    } catch { /* not json */ }
    try {
      const text = await ctx.clone().text()
      if (text.trim()) return text
    } catch { /* ignore */ }
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}

export type TranslateMessageResult = {
  translated_content: string
  target_language: string
  source_language: string | null
  model: string | null
  cached: boolean
}

export function useTranslateMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      messageId: string
      targetLanguage: string
      /** threadId нужен только для инвалидации кэша треда после успеха. */
      threadId?: string
    }): Promise<TranslateMessageResult> => {
      const { data, error } = await supabase.functions.invoke<TranslateMessageResult>('translate-message', {
        body: {
          message_id: input.messageId,
          target_language: input.targetLanguage,
        },
      })
      if (error) {
        const msg = await extractFunctionError(error, 'Ошибка перевода')
        throw new Error(msg)
      }
      if (!data) throw new Error('Пустой ответ от перевода')
      return data
    },
    onSuccess: (_data, vars) => {
      if (vars.threadId) {
        qc.invalidateQueries({ queryKey: threadTranslationsKey(vars.threadId, vars.targetLanguage) })
      }
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Ошибка перевода'
      toast.error(msg)
    },
  })
}

export function useTranslatePreview() {
  return useMutation({
    mutationFn: async (input: {
      workspaceId: string
      content: string
      targetLanguage: string
      sourceLanguage?: string
      /** Если передан — edge function может подмешать контекст треда (когда включено в настройках ws). */
      threadId?: string
    }): Promise<TranslateMessageResult> => {
      const { data, error } = await supabase.functions.invoke<TranslateMessageResult>('translate-message', {
        body: {
          workspace_id: input.workspaceId,
          content: input.content,
          target_language: input.targetLanguage,
          source_language: input.sourceLanguage,
          thread_id: input.threadId,
        },
      })
      if (error) {
        const msg = await extractFunctionError(error, 'Ошибка перевода')
        throw new Error(msg)
      }
      if (!data) throw new Error('Пустой ответ от перевода')
      return data
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Ошибка перевода'
      toast.error(msg)
    },
  })
}
