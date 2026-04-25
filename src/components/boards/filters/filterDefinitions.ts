/**
 * Реестр полей для фильтрации задач и проектов.
 */

import type { FilterFieldDef } from '../types'

export const TASK_FILTER_FIELDS: FilterFieldDef[] = [
  {
    key: 'name',
    label: 'Название',
    type: 'text',
    operators: ['contains', 'equals'],
  },
  {
    key: 'type',
    label: 'Тип',
    type: 'text',
    operators: ['equals', 'in', 'not_in'],
  },
  {
    key: 'status_id',
    label: 'Статус',
    type: 'uuid',
    operators: ['equals', 'in', 'not_in', 'is_null'],
  },
  {
    key: 'project_id',
    label: 'Проект',
    type: 'uuid',
    operators: ['equals', 'in', 'not_in'],
  },
  {
    key: 'deadline',
    label: 'Дедлайн',
    type: 'date',
    operators: ['before', 'before_eq', 'after', 'after_eq', 'date_eq', 'between', 'is_null', 'is_not_null', 'today', 'this_week', 'overdue'],
  },
  {
    key: 'is_pinned',
    label: 'Закреплено',
    type: 'boolean',
    operators: ['equals'],
  },
  {
    key: 'created_by',
    label: 'Постановщик',
    type: 'uuid',
    operators: ['equals', 'in', 'not_in'],
    supportsMe: true,
  },
  {
    key: 'assignees',
    label: 'Исполнители',
    type: 'junction',
    operators: ['in', 'not_in', 'is_null', 'is_not_null'],
    supportsMe: true,
    junctionTable: 'task_assignees',
  },
  {
    key: 'created_at',
    label: 'Дата создания',
    type: 'date',
    operators: ['before', 'before_eq', 'after', 'after_eq', 'date_eq', 'between'],
  },
  {
    key: 'updated_at',
    label: 'Дата обновления',
    type: 'date',
    operators: ['before', 'before_eq', 'after', 'after_eq', 'date_eq', 'between'],
  },
]

export const PROJECT_FILTER_FIELDS: FilterFieldDef[] = [
  {
    key: 'status_id',
    label: 'Статус',
    type: 'uuid',
    operators: ['equals', 'in', 'not_in', 'is_null'],
  },
  {
    key: 'template_id',
    label: 'Шаблон проекта',
    type: 'uuid',
    operators: ['equals', 'in', 'not_in', 'is_null'],
  },
  {
    key: 'deadline',
    label: 'Дедлайн',
    type: 'date',
    operators: ['before', 'before_eq', 'after', 'after_eq', 'date_eq', 'between', 'is_null', 'is_not_null', 'today', 'this_week', 'overdue'],
  },
  {
    key: 'created_by',
    label: 'Создатель',
    type: 'uuid',
    operators: ['equals', 'in', 'not_in'],
    supportsMe: true,
  },
  {
    key: 'participants',
    label: 'Участники',
    type: 'junction',
    operators: ['in', 'not_in', 'is_null', 'is_not_null'],
    supportsMe: true,
    junctionTable: 'project_participants',
  },
  {
    key: 'has_active_deadline_task',
    label: 'Есть активные задачи с дедлайном',
    type: 'boolean',
    operators: ['equals'],
  },
  {
    key: 'created_at',
    label: 'Дата создания',
    type: 'date',
    operators: ['before', 'before_eq', 'after', 'after_eq', 'date_eq', 'between'],
  },
  {
    key: 'updated_at',
    label: 'Дата обновления',
    type: 'date',
    operators: ['before', 'before_eq', 'after', 'after_eq', 'date_eq', 'between'],
  },
]

export function getFieldsForEntity(entityType: 'task' | 'project'): FilterFieldDef[] {
  return entityType === 'task' ? TASK_FILTER_FIELDS : PROJECT_FILTER_FIELDS
}

export function getFieldDef(
  entityType: 'task' | 'project',
  fieldKey: string,
): FilterFieldDef | undefined {
  return getFieldsForEntity(entityType).find((f) => f.key === fieldKey)
}
