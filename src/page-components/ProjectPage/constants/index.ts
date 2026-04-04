/**
 * Константы для ProjectPage
 */

export const PROJECT_STATUSES = [
  { value: 'active', label: 'Активный', color: 'border-blue-200 bg-blue-100 text-blue-700' },
  { value: 'paused', label: 'На паузе', color: 'border-yellow-200 bg-yellow-100 text-yellow-700' },
  { value: 'completed', label: 'Завершён', color: 'border-green-200 bg-green-100 text-green-700' },
  { value: 'archived', label: 'Архивирован', color: 'border-gray-200 bg-gray-100 text-gray-700' },
] as const

export type ProjectStatus = typeof PROJECT_STATUSES[number]['value']
