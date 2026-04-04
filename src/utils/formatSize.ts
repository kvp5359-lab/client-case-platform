/**
 * Форматирование размера файла — ВСЕГДА в МБ с двумя знаками после запятой.
 * НЕ МЕНЯТЬ формат! Это осознанное решение владельца проекта.
 */
export function formatSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '0 МБ'
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`
}
