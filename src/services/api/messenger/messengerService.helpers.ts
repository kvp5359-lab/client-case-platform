/**
 * Internal helpers для messengerService и связанных sub-сервисов.
 * Вынесены, чтобы draft/participant/other sub-service мог переиспользовать
 * MESSAGE_SELECT, cast-функции и hydrateReplyMessages без цикла.
 */

import type { ProjectMessage } from './messengerService.types'

export const MESSAGE_SELECT = `
  *,
  sender:participants!sender_participant_id(name, last_name, avatar_url),
  reactions:message_reactions(*, participant:participants!participant_id(name, last_name, avatar_url)),
  attachments:message_attachments(*),
  reply_to_message:reply_to_message_id(id, content, sender_name, sender_participant_id)
`
// ⚠️ reply_to_message — self-join embed ЧЕРЕЗ ИМЯ КОЛОНКИ (`:reply_to_message_id`),
// НЕ через имя FK: у самоссылки хинт по FK/колонке с `!` разворачивает ОБРАТНУЮ
// сторону (массив ответов НА это сообщение) — проверено живым запросом
// 2026-07-23. Синтаксис `alias:column(cols)` даёт родителя (объект/null).
// Он заменил отдельный второй запрос hydrateReplyMessages (−1 сетевой
// round-trip на каждое открытие треда, цитаты на месте с первого кадра).

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

// hydrateReplyMessages удалена 2026-07-23: цитаты приезжают embed'ом в
// MESSAGE_SELECT (см. комментарий выше). Набор полей цитаты при расширении
// менять в embed'е, тип — ReplyMessage.
