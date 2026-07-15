import { CREATOR_ASSIGNEE_ID } from '@/types/participants'

/**
 * Псевдо-исполнитель «Создатель задачи» в списках исполнителей.
 *
 * Пикер работает одним набором id, а хранение раздельное: реальные исполнители
 * идут в таблицу (FK на participants), а «создатель» — флагом на источнике
 * (правило подстановки, а не человек). Эти две функции и есть переход между
 * представлениями — держим его в одном месте, чтобы фильтр сентинела не
 * расползался по форме.
 */

/** Хранение → пикер: реальные исполнители + пункт «Создатель задачи». */
export function withCreatorSentinel(
  assigneeIds: readonly string[],
  assignToCreator: boolean,
): Set<string> {
  const ids = new Set(assigneeIds)
  if (assignToCreator) ids.add(CREATOR_ASSIGNEE_ID)
  return ids
}

/** Пикер → хранение: вынимаем сентинел во флаг, остальных — в список. */
export function splitCreatorSentinel(ids: Iterable<string>): {
  assignToCreator: boolean
  assigneeIds: string[]
} {
  const all = Array.from(ids)
  return {
    assignToCreator: all.includes(CREATOR_ASSIGNEE_ID),
    assigneeIds: all.filter((id) => id !== CREATOR_ASSIGNEE_ID),
  }
}
