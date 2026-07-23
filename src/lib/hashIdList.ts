/**
 * Короткий стабильный ключ для списка id (React Query queryKey).
 *
 * Раньше ключи вида `taskIds.sort().join(',')` на доске с календарным списком
 * (~2000 UUID) раздували queryKey до ~74 КБ строки — она хранится в кэше и
 * сравнивается при каждом обращении (аудит 2026-07-23, находка №12).
 *
 * Двойной 32-битный хеш (djb2 + FNV-подобный) + длина списка: вероятность
 * коллизии на практике пренебрежима, порядок id не влияет (сортируем).
 */
export function hashIdList(ids: string[]): string {
  const sorted = [...ids].sort()
  let h1 = 5381
  let h2 = 52711
  for (const s of sorted) {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i)
      h1 = ((h1 * 33) ^ c) >>> 0
      h2 = (h2 * 31 + c) >>> 0
    }
  }
  return `${ids.length}:${h1.toString(36)}:${h2.toString(36)}`
}
