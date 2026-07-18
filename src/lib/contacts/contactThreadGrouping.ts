/**
 * Чистая логика группировки/фильтрации переписок контакта для карточки.
 * Без React — покрыта юнит-тестами (contactThreadGrouping.test.ts).
 * Работает над структурным минимумом полей, чтобы не зависеть от слоя hooks.
 */

/** Минимум полей треда, нужный для группировки/фильтра/даты группы. */
export type GroupableThread = {
  project_id: string | null
  project_name: string | null
  project_name_prefix: string | null
  name: string
  last_message_at: string | null
}

export type ContactThreadProjectGroup<T extends GroupableThread> = {
  projectId: string
  projectName: string
  namePrefix: string | null
  /** Дата самого свежего треда группы (max по last_message_at). НЕ зависит от порядка входа. */
  lastMessageAt: string | null
  threads: T[]
}

/** Больший из двух ISO-таймстампов, null-безопасно (ISO сравнимы лексикографически). */
function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a >= b ? a : b
}

/**
 * Делит треды на личные (без проекта) и группы по проектам.
 * Порядок групп — по первому появлению проекта во входном массиве (вызывающий
 * передаёт треды, отсортированные по свежести). Дата группы (`lastMessageAt`)
 * считается как max по её тредам — не полагается на порядок входа.
 */
export function groupContactThreads<T extends GroupableThread>(
  threads: T[],
): { personal: T[]; projects: ContactThreadProjectGroup<T>[] } {
  const personal: T[] = []
  const map = new Map<string, ContactThreadProjectGroup<T>>()
  for (const t of threads) {
    if (!t.project_id) {
      personal.push(t)
      continue
    }
    let g = map.get(t.project_id)
    if (!g) {
      g = {
        projectId: t.project_id,
        projectName: t.project_name ?? 'Проект',
        namePrefix: t.project_name_prefix ?? null,
        lastMessageAt: null,
        threads: [],
      }
      map.set(t.project_id, g)
    }
    g.threads.push(t)
    g.lastMessageAt = maxIso(g.lastMessageAt, t.last_message_at)
  }
  return { personal, projects: [...map.values()] }
}

/**
 * Фильтр по подстроке: совпадение по названию треда ИЛИ названию проекта.
 * Пустой (после trim) запрос → исходный массив.
 */
export function filterContactThreads<T extends GroupableThread>(threads: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return threads
  return threads.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      (t.project_name?.toLowerCase().includes(q) ?? false),
  )
}
