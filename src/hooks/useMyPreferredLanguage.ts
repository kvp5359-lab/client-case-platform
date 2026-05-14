"use client"

/**
 * Целевой язык переводов сообщений для залогиненного пользователя.
 *
 * Хранится в `participants.preferred_language` (per-workspace), но UI глобальный:
 * читаем из любого participant юзера, при сохранении RPC обновляет всех его
 * participants разом. Если в будущем понадобится разный язык в разных воркспейсах,
 * UI-расширим, БД не трогаем.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { participantKeys, STALE_TIME, GC_TIME } from '@/hooks/queryKeys'
import { toast } from 'sonner'

export const TRANSLATION_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'uk', label: 'Українська' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'pl', label: 'Polski' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'ar', label: 'العربية' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'he', label: 'עברית' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'cs', label: 'Čeština' },
  { code: 'ro', label: 'Română' },
  { code: 'bg', label: 'Български' },
  { code: 'el', label: 'Ελληνικά' },
]

export function languageLabel(code: string | null | undefined): string {
  if (!code) return ''
  return TRANSLATION_LANGUAGES.find((l) => l.code === code)?.label ?? code.toUpperCase()
}

const myLangKey = (userId: string | undefined) => ['my-preferred-language', userId] as const

export function useMyPreferredLanguage() {
  const { user } = useAuth()

  return useQuery({
    queryKey: myLangKey(user?.id),
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from('participants')
        .select('preferred_language, updated_at')
        .eq('user_id', user!.id)
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data?.preferred_language as string) || 'ru'
    },
    enabled: !!user?.id,
    staleTime: STALE_TIME.LONG,
    gcTime: GC_TIME.LONG,
  })
}

export function useSetMyPreferredLanguage() {
  const { user } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (language: string) => {
      const { error } = await supabase.rpc('set_my_preferred_language', { p_language: language })
      if (error) throw error
      return language
    },
    onSuccess: (language) => {
      qc.setQueryData(myLangKey(user?.id), language)
      // Перечитать participants-кэши, чтобы свежие данные подтянулись где нужно
      qc.invalidateQueries({ queryKey: participantKeys.all })
      toast.success(`Язык переводов: ${languageLabel(language)}`)
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Ошибка сохранения языка'
      toast.error(msg)
    },
  })
}
