import { supabase } from '@/lib/supabase'
import { ConversationError } from '@/services/errors/AppError'
import { logger } from '@/utils/logger'

/**
 * Toggle reaction (add/remove)
 */
export async function toggleReaction(
  messageId: string,
  participantId: string,
  emoji: string,
): Promise<{ added: boolean }> {
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
 * Works only if bot is group admin.
 */
async function syncReactionToTelegram(messageId: string, emoji: string, added: boolean) {
  try {
    const { data: msg } = await supabase
      .from('project_messages')
      .select('telegram_message_id, telegram_chat_id')
      .eq('id', messageId)
      .single()

    if (!msg?.telegram_message_id || !msg?.telegram_chat_id) return

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
