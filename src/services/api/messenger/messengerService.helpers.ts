/**
 * Internal helpers для messengerService и связанных sub-сервисов.
 * Вынесены, чтобы draft/participant/other sub-service мог переиспользовать
 * MESSAGE_SELECT, cast-функции и hydrateReplyMessages без цикла.
 */

import { supabase } from '@/lib/supabase'
import type { ProjectMessage, ReplyMessage } from './messengerService.types'

export const MESSAGE_SELECT = `
  *,
  sender:participants!sender_participant_id(avatar_url),
  reactions:message_reactions(*, participant:participants!participant_id(name, last_name, avatar_url)),
  attachments:message_attachments(*)
`

/**
 * Кастит "сырой" ряд из `supabase.from('project_messages').select(MESSAGE_SELECT)`
 * в доменный `ProjectMessage`. Джойны в Supabase не типизируются автоматически,
 * поэтому мы принимаем любой Record и говорим TS «доверься, shape совпадает».
 *
 * Использовать **только** для рядов из MESSAGE_SELECT — у других запросов
 * shape будет другой и ProjectMessage из такого каста окажется врущим.
 */
export function castToProjectMessage(row: Record<string, unknown>): ProjectMessage {
  return row as unknown as ProjectMessage
}

export function castToProjectMessages(rows: Record<string, unknown>[]): ProjectMessage[] {
  return rows as unknown as ProjectMessage[]
}

/** Hydrate reply_to_message for messages with reply_to_message_id */
export async function hydrateReplyMessages(messages: ProjectMessage[]): Promise<void> {
  const replyIds = [
    ...new Set(messages.map((m) => m.reply_to_message_id).filter(Boolean) as string[]),
  ]
  if (replyIds.length === 0) return

  const { data } = await supabase
    .from('project_messages')
    .select('id, content, sender_name')
    .in('id', replyIds)

  if (!data) return
  const map = new Map(data.map((r) => [r.id, r as ReplyMessage]))
  for (const msg of messages) {
    msg.reply_to_message = msg.reply_to_message_id
      ? (map.get(msg.reply_to_message_id) ?? null)
      : null
  }
}
