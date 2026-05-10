/**
 * Стратегии переключения реакций по каналам мессенджеров.
 *
 * До рефакторинга вся логика была свалена в `toggleReaction` switch'ем по
 * source. Теперь каждая стратегия — отдельная функция со своим контрактом:
 *  - Channel-native (TG MTProto, TG Business): вся работа в Edge Function,
 *    она сама обновляет наш RPC и шлёт во внешний канал.
 *  - Internal-first (TG group, Wazzup, всё остальное): сначала пишем в нашу
 *    БД через `toggle_message_reaction` RPC, затем (если added=true) шлём
 *    эмодзи-эхо во внешний канал через отдельную Edge Function.
 *
 * Карта стратегий по `project_messages.source`:
 *   telegram_business → telegramBusinessStrategy
 *   telegram_mtproto  → telegramMtprotoStrategy
 *   wazzup            → internalFirstStrategy + wazzupSync
 *   *                 → internalFirstStrategy + telegramGroupSync
 */

import { supabase } from '@/lib/supabase'
import { ConversationError } from '@/services/errors/AppError'
import { logger } from '@/utils/logger'
import { isEmailSource } from './messengerService.types'

export interface ReactionParams {
  messageId: string
  participantId: string
  emoji: string
}

export interface ReactionResult {
  added: boolean
}

/** Channel-native: одна Edge Function делает всё (наш RPC + native-реакция). */
async function invokeChannelNative(
  fnName: string,
  params: ReactionParams,
): Promise<ReactionResult> {
  const { data, error } = await supabase.functions.invoke(fnName, {
    body: {
      message_id: params.messageId,
      participant_id: params.participantId,
      emoji: params.emoji,
    },
  })
  if (error) throw new ConversationError(`Ошибка переключения реакции: ${error.message}`)
  return { added: !!(data as { added?: boolean })?.added }
}

/**
 * Internal-first: пишем в нашу БД, потом опционально синкаем во внешний канал.
 * `externalSync` вызывается fire-and-forget (не блокирует UI на ошибках).
 */
async function internalFirst(
  params: ReactionParams,
  externalSync?: (params: ReactionParams, added: boolean) => Promise<void>,
): Promise<ReactionResult> {
  const { data, error } = await supabase.rpc('toggle_message_reaction', {
    p_message_id: params.messageId,
    p_participant_id: params.participantId,
    p_emoji: params.emoji,
  })
  if (error) throw new ConversationError(`Ошибка переключения реакции: ${error.message}`)

  const added = data as boolean
  if (externalSync) {
    void externalSync(params, added).catch((e) => logger.warn('reaction external sync:', e))
  }
  return { added }
}

/** TG group: setMessageReaction через бота, если он админ группы. */
async function syncTelegramGroup(params: ReactionParams, added: boolean): Promise<void> {
  const { data: msg } = await supabase
    .from('project_messages')
    .select('telegram_message_id, telegram_chat_id')
    .eq('id', params.messageId)
    .single()
  if (!msg?.telegram_message_id || !msg?.telegram_chat_id) return

  await supabase.auth.getSession()
  const { data: funcData } = await supabase.functions.invoke('telegram-set-reaction', {
    body: {
      chat_id: msg.telegram_chat_id,
      message_id: msg.telegram_message_id,
      reaction: added ? [{ type: 'emoji', emoji: params.emoji }] : [],
    },
  })
  if (funcData?.error) logger.warn('Telegram reaction sync failed:', funcData.error)
}

/**
 * Wazzup: только когда added=true. WhatsApp Bot API не позволяет удалять
 * чужие сообщения, а наш эмодзи-реплай уже доставлен клиенту — отзыв
 * работать не будет.
 */
async function syncWazzup(params: ReactionParams, added: boolean): Promise<void> {
  if (!added) return
  await supabase.functions.invoke('wazzup-send-reaction', {
    body: { message_id: params.messageId, emoji: params.emoji },
  })
}

/**
 * Главный диспетчер. Определяет стратегию по source и применяет её.
 */
export async function toggleReactionByChannel(
  source: string | undefined,
  params: ReactionParams,
): Promise<ReactionResult> {
  if (source === 'telegram_business') return invokeChannelNative('telegram-business-react', params)
  if (source === 'telegram_mtproto') return invokeChannelNative('telegram-mtproto-react', params)
  if (source === 'wazzup') return internalFirst(params, syncWazzup)
  // Default: TG-группы (через секретаря/личного бота) + всё остальное
  // (web, email — там просто наш RPC без внешнего sync).
  return internalFirst(params, syncTelegramGroup)
}

/**
 * Поддерживается ли постановка реакции для этого канала так, чтобы
 * получатель её увидел? Если нет — UI скрывает кнопку реакции, чтобы не
 * вводить пользователя в заблуждение «отреагировал, но клиент ничего не
 * увидит».
 *
 * Состояние на 2026-05-10 (см. infrastructure.md → «Мессенджер-каналы»):
 *  - web                — внутренний чат, реакции живут только в БД ✅
 *  - telegram (group)   — `setMessageReaction` если бот админ группы ✅
 *  - telegram_mtproto   — нативно через MTProto ✅
 *  - telegram_business  — Bot API не отдаёт `message_reaction` для 1-на-1
 *                         Business-чатов (бот не может быть «админом»
 *                         личного диалога). Можем отправить reply-эмодзи,
 *                         но клиент это видит как сообщение, а не реакцию,
 *                         и поставленная им реакция-tap до нас не доходит
 *                         в принципе. Поэтому кнопку скрываем —
 *                         пользователь может реагировать через свайп
 *                         «Ответить» → эмодзи как обычное сообщение.
 *  - wazzup             — WhatsApp Bot API не позволяет ставить реакции
 *                         нативно; reply-эмодзи возможен (как с Business),
 *                         но это сообщение, не реакция.
 *  - email              — у почты нет понятия реакции.
 */
export function isReactionSupportedForSource(source: string | undefined | null): boolean {
  if (!source) return true // legacy/internal — оставляем как было
  if (source === 'telegram_business') return false
  if (source === 'wazzup') return false
  if (isEmailSource(source)) return false
  return true
}
