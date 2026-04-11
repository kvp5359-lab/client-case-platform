/**
 * Конфиги для <ListSettingsDialog>: справочники сортировки, группировки,
 * видимых полей для задач и проектов. Вынесено из ListSettingsDialog.tsx
 * в отдельный файл, чтобы главный компонент не был «стеной констант».
 */

import type { SortField, SortDir, VisibleField, GroupByField } from './types'

export const SORT_DIRS: { value: SortDir; label: string }[] = [
  { value: 'asc', label: 'По возрастанию' },
  { value: 'desc', label: 'По убыванию' },
]

export const TASK_SORT_FIELDS: { value: SortField; label: string }[] = [
  { value: 'created_at', label: 'Дата создания' },
  { value: 'updated_at', label: 'Дата обновления' },
  { value: 'deadline', label: 'Дедлайн' },
  { value: 'status_order', label: 'Статус' },
  { value: 'name', label: 'Название' },
]

export const PROJECT_SORT_FIELDS: { value: SortField; label: string }[] = [
  { value: 'created_at', label: 'Дата создания' },
  { value: 'updated_at', label: 'Дата обновления' },
  { value: 'name', label: 'Название' },
]

export const TASK_GROUP_BY_OPTIONS: { value: GroupByField; label: string }[] = [
  { value: 'none', label: 'Без группировки' },
  { value: 'status', label: 'Статус' },
  { value: 'project', label: 'Проект' },
  { value: 'assignee', label: 'Исполнитель' },
  { value: 'deadline', label: 'Дедлайн' },
]

export const PROJECT_GROUP_BY_OPTIONS: { value: GroupByField; label: string }[] = [
  { value: 'none', label: 'Без группировки' },
  { value: 'status', label: 'Статус' },
]

export const TASK_VISIBLE_FIELDS: { value: VisibleField; label: string }[] = [
  { value: 'status', label: 'Статус' },
  { value: 'deadline', label: 'Дедлайн' },
  { value: 'assignees', label: 'Исполнители' },
  { value: 'project', label: 'Проект' },
]

export const PROJECT_VISIBLE_FIELDS: { value: VisibleField; label: string }[] = [
  { value: 'status', label: 'Статус' },
  { value: 'template', label: 'Шаблон' },
]

/** По умолчанию показываемые поля для типа списка. */
export function defaultVisibleFields(entityType: 'task' | 'project' | 'inbox'): VisibleField[] {
  if (entityType === 'inbox') return []
  return entityType === 'project'
    ? ['status', 'template']
    : ['status', 'deadline', 'assignees', 'project']
}
