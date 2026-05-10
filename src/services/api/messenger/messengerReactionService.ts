/**
 * Точка входа для toggle-реакций. Реальная логика (выбор стратегии по
 * каналу + вызовы) вынесена в `reactionStrategies.ts` — оставляем тонкую
 * обёртку, которая считывает `source` сообщения и делегирует.
 */

import { supabase } from '@/lib/supabase'
import { toggleReactionByChannel, type ReactionResult } from './reactionStrategies'

export async function toggleReaction(
  messageId: string,
  participantId: string,
  emoji: string,
): Promise<ReactionResult> {
  const { data: msg } = await supabase
    .from('project_messages')
    .select('source')
    .eq('id', messageId)
    .single()

  const source = msg?.source ?? undefined
  return toggleReactionByChannel(source, { messageId, participantId, emoji })
}
