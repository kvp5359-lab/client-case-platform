/**
 * Health-check Telegram-привязки треда.
 *
 * Возвращает признаки проблем, которые видно прямо из БД (без TG API):
 *   - hasTgLink: есть запись в project_telegram_chats для этого треда
 *   - missingSecretary: запись есть, но `integration_id IS NULL` — это значит
 *     группа подключена через `/link`, но в БД не указано какой бот-секретарь
 *     должен её обслуживать. Edge function попытается self-heal через TG API
 *     при первой попытке отправки. Но юзеру лучше предупредить заранее
 *     (вдруг секретаря в группе вообще нет — отправка будет failed).
 *
 * Используется для баннера в шапке треда. Превентивная защита: пользователь
 * видит проблему до того как впервые столкнётся с failed-сообщением.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type ThreadTelegramHealth = {
  hasTgLink: boolean
  missingSecretary: boolean
  telegramChatId: number | null
}

export function useThreadTelegramHealth(threadId: string | null | undefined) {
  return useQuery<ThreadTelegramHealth>({
    queryKey: ['thread-telegram-health', threadId],
    enabled: !!threadId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!threadId) {
        return { hasTgLink: false, missingSecretary: false, telegramChatId: null }
      }
      const { data, error } = await supabase
        .from('project_telegram_chats')
        .select('integration_id, telegram_chat_id, is_active')
        .eq('thread_id', threadId)
        .eq('is_active', true)
        .maybeSingle()
      if (error) {
        // Не критично — баннер просто не покажется
        console.warn('[useThreadTelegramHealth] query failed:', error)
        return { hasTgLink: false, missingSecretary: false, telegramChatId: null }
      }
      if (!data) {
        return { hasTgLink: false, missingSecretary: false, telegramChatId: null }
      }
      return {
        hasTgLink: true,
        missingSecretary: data.integration_id == null,
        telegramChatId: data.telegram_chat_id ?? null,
      }
    },
  })
}
