/**
 * Форматирование размера с автоматическим выбором единицы (Б / КБ / МБ).
 *
 * Используется когда размеры реально разнокалиберные (от байтов до десятков МБ)
 * и фикс-формат «всегда МБ» (formatSize) даёт визуальный мусор «0.00 МБ» для
 * маленьких файлов. Один знак после запятой.
 *
 * Если нужно ВСЕГДА в МБ — используй formatSize.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 Б'
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}
