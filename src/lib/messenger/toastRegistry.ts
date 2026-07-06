/**
 * Реестр всплывающих уведомлений (тостов) о новых сообщениях.
 *
 * Живёт в leaf-слое (`lib/`), а не в `hooks/`, чтобы к нему могли обращаться и
 * UI-слой (хук тостов), и сервис `markAsRead` — без нарушения направления
 * зависимостей (сервис не должен тянуть из `hooks/`).
 *
 * Хранит сгруппированные строки тоста по ключу (проект + отправитель + тред) и
 * умеет гасить тосты по проекту/треду. Гашение по треду вызывается из единой
 * точки пометки прочитанным (`markAsRead`) — если тред прочитан, его тосты уже
 * не актуальны.
 */
import { toast } from 'sonner'

export type GroupKey = string

/** Строки сообщений по группе (projectId + sender + thread). */
export const groupedLines = new Map<GroupKey, string[]>()

export function makeGroupKey(
  projectId: string,
  senderParticipantId: string | null,
  threadId: string | null,
): GroupKey {
  return `${projectId}:${senderParticipantId ?? 'unknown'}:${threadId ?? 'no-thread'}`
}

/** Погасить все тосты сообщений по проекту. */
export function dismissProjectToasts(projectId: string) {
  for (const key of groupedLines.keys()) {
    if (key.startsWith(`${projectId}:`)) {
      groupedLines.delete(key)
      toast.dismiss(key)
    }
  }
}

/** Погасить все тосты сообщений по треду (по суффиксу groupKey).
 *  Вызывается из `markAsRead` при любой пометке прочитанным (завершение задачи,
 *  открытие треда, кнопка «Прочитано», реакция, инбокс) и при удалении треда.
 *  Работает и для проектных тредов, и для личных диалогов (project_id=null). */
export function dismissThreadToasts(threadId: string) {
  const suffix = `:${threadId}`
  for (const key of groupedLines.keys()) {
    if (key.endsWith(suffix)) {
      groupedLines.delete(key)
      toast.dismiss(key)
    }
  }
}
