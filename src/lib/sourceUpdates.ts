/**
 * Прочитанность обновлений источников — клиентское зеркало серверной формулы.
 *
 * Сервер (RPC `get_source_update_unread_projects`, миграция
 * 20260710160000_source_update_reads.sql) считает файл непрочитанным, если
 * `source_documents.created_at > coalesce(last_seen_at, epoch_at)`. Эта функция
 * обязана давать тот же ответ — иначе лента «только непрочитанные» разойдётся
 * с красными точками/бейджем. Меняешь формулу — меняй ОБА места.
 */

/**
 * Непрочитан ли файл источника.
 *
 * @param createdAtDb `source_documents.created_at` (момент первого появления у
 *   нас; Drive-даты не годятся — сервер считает по created_at). NULL в SQL не
 *   проходит сравнение `>` → файл НЕ непрочитан, зеркалим это.
 * @param lastSeenAt отметка прочтения проекта пользователем (нет — null).
 * @param epochAt точка отсчёта фичи: всё, что появилось раньше, прочитано.
 */
export function isSourceUpdateUnread(
  createdAtDb: string | null,
  lastSeenAt: string | null | undefined,
  epochAt: string,
): boolean {
  if (!createdAtDb) return false
  return new Date(createdAtDb) > new Date(lastSeenAt ?? epochAt)
}
