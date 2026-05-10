/**
 * Реестр полей для фильтрации тредов (project_threads с типами task/chat/email)
 * и проектов.
 *
 * `applicableTypes` (только для тредов) ограничивает поле подмножеством типов
 * треда — например, статус и дедлайн есть только у task-тредов. Когда фильтр
 * содержит явное ограничение по type, UI скрывает неприменимые поля. Без
 * ограничения по type — показываем все, движок отбрасывает несовпадающие
 * на этапе сравнения (status_id у чата всегда null → не пройдёт equals).
 */

import type { FilterFieldDef } from './types'

export const THREAD_FILTER_FIELDS: FilterFieldDef[] = [
  {
    key: 'name',
    label: 'Название',
    type: 'text',
    operators: ['contains', 'equals'],
    applicableTypes: ['task', 'chat', 'email'],
  },
  {
    key: 'type',
    label: 'Тип',
    type: 'text',
    operators: ['equals', 'in', 'not_in'],
    applicableTypes: ['task', 'chat', 'email'],
  },
  {
    key: 'status_id',
    label: 'Статус',
    type: 'uuid',
    operators: ['equals', 'in', 'not_in', 'is_null'],
    applicableTypes: ['task'],
  },
  {
    key: 'project_id',
    label: 'Проект',
    type: 'uuid',
    operators: ['equals', 'in', 'not_in'],
    applicableTypes: ['task', 'chat', 'email'],
  },
  {
    key: 'deadline',
    label: 'Дедлайн',
    type: 'date',
    operators: ['before', 'before_eq', 'after', 'after_eq', 'date_eq', 'between', 'is_null', 'is_not_null', 'today', 'this_week', 'overdue'],
    applicableTypes: ['task'],
  },
  {
    key: 'is_pinned',
    label: 'Закреплено',
    type: 'boolean',
    operators: ['equals'],
    applicableTypes: ['task', 'chat', 'email'],
  },
  {
    key: 'created_by',
    label: 'Постановщик',
    type: 'uuid',
    operators: ['equals', 'in', 'not_in'],
    supportsMe: true,
    applicableTypes: ['task', 'chat', 'email'],
  },
  {
    key: 'assignees',
    label: 'Исполнители',
    type: 'junction',
    operators: ['in', 'not_in', 'is_null', 'is_not_null'],
    supportsMe: true,
    junctionTable: 'task_assignees',
    applicableTypes: ['task'],
  },
  {
    key: 'created_at',
    label: 'Дата создания',
    type: 'date',
    operators: ['before', 'before_eq', 'after', 'after_eq', 'date_eq', 'between'],
    applicableTypes: ['task', 'chat', 'email'],
  },
  {
    key: 'updated_at',
    label: 'Дата обновления',
    type: 'date',
    operators: ['before', 'before_eq', 'after', 'after_eq', 'date_eq', 'between'],
    applicableTypes: ['task', 'chat', 'email'],
  },
  // ── Поля для chat/email-тредов ────────────────────────
  {
    key: 'last_message_at',
    label: 'Последнее сообщение',
    type: 'date',
    operators: ['before', 'before_eq', 'after', 'after_eq', 'date_eq', 'between', 'is_null', 'is_not_null', 'today', 'this_week'],
    applicableTypes: ['chat', 'email'],
  },
  {
    key: 'unread',
    label: 'Есть непрочитанные',
    type: 'boolean',
    operators: ['equals'],
    applicableTypes: ['chat', 'email'],
  },
  {
    key: 'channel',
    label: 'Канал',
    type: 'text',
    operators: ['equals', 'in', 'not_in'],
    applicableTypes: ['chat', 'email'],
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
  // Этап 4.2 CRM-фрейма: фильтры под воронку лидов и связь с контактом.
  {
    key: 'is_lead_template',
    label: 'Это лид',
    type: 'boolean',
    operators: ['equals'],
  },
  {
    key: 'final_kind',
    label: 'Тип финального статуса',
    type: 'text',
    operators: ['equals', 'in', 'not_in', 'is_null', 'is_not_null'],
  },
  {
    key: 'contact_participant_id',
    label: 'Контакт',
    type: 'uuid',
    operators: ['equals', 'in', 'not_in', 'is_null', 'is_not_null'],
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

export function getFieldsForEntity(entityType: 'thread' | 'project'): FilterFieldDef[] {
  return entityType === 'thread' ? THREAD_FILTER_FIELDS : PROJECT_FILTER_FIELDS
}

export function getFieldDef(
  entityType: 'thread' | 'project',
  fieldKey: string,
): FilterFieldDef | undefined {
  return getFieldsForEntity(entityType).find((f) => f.key === fieldKey)
}
