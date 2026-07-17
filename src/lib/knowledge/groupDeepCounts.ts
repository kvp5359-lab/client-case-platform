/**
 * Рекурсивный счётчик элементов групп базы знаний:
 * для каждой группы — свои элементы + элементы всех подгрупп (любая глубина).
 * Один обход O(n) вместо пересчёта поддерева на каждый узел.
 */

export function buildGroupDeepCountMap(
  groups: Array<{ id: string; parent_id: string | null }>,
  getDirectCount: (groupId: string) => number,
): Map<string, number> {
  const childrenByParent = new Map<string, string[]>()
  for (const g of groups) {
    if (!g.parent_id) continue
    const list = childrenByParent.get(g.parent_id)
    if (list) list.push(g.id)
    else childrenByParent.set(g.parent_id, [g.id])
  }

  const counts = new Map<string, number>()
  const countDeep = (groupId: string): number => {
    const cached = counts.get(groupId)
    if (cached !== undefined) return cached
    const total =
      getDirectCount(groupId) +
      (childrenByParent.get(groupId) ?? []).reduce((sum, childId) => sum + countDeep(childId), 0)
    counts.set(groupId, total)
    return total
  }
  for (const g of groups) countDeep(g.id)
  return counts
}
