import { supabase } from '@/lib/supabase'
import { ConversationError } from '@/services/errors/AppError'
import { logger } from '@/utils/logger'

/**
 * Toggle reaction (add/remove)
 *
 * Для обычных сообщений (включая групповой Telegram) — RPC + setMessageReaction.
 * Для Telegram Business — отдельная Edge Function `telegram-business-react`,
 * потому что Telegram Bot API не поддерживает setMessageReaction в business-чатах.
 * Workaround там: реакция отправляется как обычное сообщение-реплай с эмодзи,
 * снятие — deleteBusinessMessages нашего реплая.
 */
export async function toggleReaction(
  messageId: string,
  participantId: string,
  emoji: string,
): Promise<{ added: boolean }> {
  // Определяем источник сообщения, чтобы выбрать путь.
  const { data: msg } = await supabase
    .from('project_messages')
    .select('source')
    .eq('id', messageId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const source = (msg as any)?.source as string | undefined
  if (source === 'telegram_business') {
    const { data, error } = await supabase.functions.invoke('telegram-business-react', {
      body: { message_id: messageId, participant_id: participantId, emoji },
    })
    if (error) throw new ConversationError(`Ошибка переключения реакции: ${error.message}`)
    return { added: !!(data as { added?: boolean })?.added }
  }

  const { data, error } = await supabase.rpc('toggle_message_reaction', {
    p_message_id: messageId,
    p_participant_id: participantId,
    p_emoji: emoji,
  })

  if (error) throw new ConversationError(`Ошибка переключения реакции: ${error.message}`)

  const added = data as boolean
  void syncReactionToTelegram(messageId, emoji, added)
  return { added }
}

/**
 * Sync reaction to Telegram via setMessageReaction API.
 * Works only if bot is group admin (групповой секретарь).
 * Для Telegram Business используется отдельный путь — telegram-business-react,
 * вызывается из toggleReaction до этой функции.
 */
async function syncReactionToTelegram(messageId: string, emoji: string, added: boolean) {
  try {
    const { data: msg } = await supabase
      .from('project_messages')
      .select('telegram_message_id, telegram_chat_id')
      .eq('id', messageId)
      .single()

    if (!msg?.telegram_message_id || !msg?.telegram_chat_id) return

    await supabase.auth.getSession()

    const { data: funcData } = await supabase.functions.invoke('telegram-set-reaction', {
      body: {
        chat_id: msg.telegram_chat_id,
        message_id: msg.telegram_message_id,
        reaction: added ? [{ type: 'emoji', emoji }] : [],
      },
    })

    if (funcData?.error) {
      logger.warn('Telegram reaction sync failed:', funcData.error)
    }
  } catch (err) {
    logger.warn('Telegram reaction sync error:', err)
  }
}
