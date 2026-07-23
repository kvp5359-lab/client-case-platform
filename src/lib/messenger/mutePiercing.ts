/**
 * «Сообщение пробивает mute?» — зеркало серверного v_priority из
 * `recompute_thread_unread_for`: прямое @упоминание меня ИЛИ ответ на моё
 * сообщение. Только такие сообщения дают бейдж заглушённому треду.
 *
 * Зачем на фронте: в заглушённом треде красный контур непрочитанного рисуется
 * ТОЛЬКО у пробивших mute сообщений, остальные — спокойным серым. Иначе бейдж
 * говорил «1», а лента красила красным все 70+ непрочитанных (жалоба
 * 2026-07-23).
 *
 * Упоминание детектится по mention-узлу в HTML: tiptap сохраняет
 * `data-id="<participant_id>"`, санитайзер бабла data-атрибуты пропускает.
 * Это дешёвое зеркало `message_mentions` без отдельного запроса; точный
 * источник у БД — сама таблица, но для тона подсветки совпадение по узлу
 * достаточно (текстовое «@Имя» без узла упоминанием не является и в БД).
 */

export type MutePiercingSignals = {
  content: string
  reply_to_message?: { sender_participant_id?: string | null } | null
}

export function isMutePiercingMessage(
  message: MutePiercingSignals,
  myParticipantId: string | null | undefined,
): boolean {
  if (!myParticipantId) return false
  if (message.reply_to_message?.sender_participant_id === myParticipantId) return true
  return message.content.includes(`data-id="${myParticipantId}"`)
}
