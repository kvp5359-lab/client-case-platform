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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const source = (msg as any)?.source as string | undefined
  return toggleReactionByChannel(source, { messageId, participantId, emoji })
}
