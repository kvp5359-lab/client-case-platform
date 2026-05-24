/**
 * Описания доступных колонок таблицы для списков item_lists.
 *
 * Каждая колонка имеет ключ, лейбл и применимый entity_type. Чекбокс и
 * название всегда есть; остальные включаются/выключаются через настройки.
 */

export type ItemListColumnKey =
  // Общие
  | 'name'
  | 'created_at'
  | 'updated_at'
  // Треды
  | 'type'
  | 'status'
  | 'project'
  | 'deadline'
  | 'assignees'
  | 'is_pinned'
  | 'last_message_at'
  | 'unread'
  // Проекты
  | 'template'
  | 'next_task_deadline'
  | 'participants'

export type ColumnDef = {
  key: ItemListColumnKey
  label: string
  defaultWidth: number
  /** Минимальная ширина при ресайзе. */
  minWidth: number
  /** К каким entity_type применима колонка. */
  entityTypes: Array<'thread' | 'project'>
  /** Можно ли скрыть колонку (false для name — обязательная). */
  required?: boolean
}

export const ALL_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Название', defaultWidth: 320, minWidth: 200, entityTypes: ['thread', 'project'], required: true },
  { key: 'type', label: 'Тип', defaultWidth: 110, minWidth: 80, entityTypes: ['thread'] },
  { key: 'status', label: 'Статус', defaultWidth: 160, minWidth: 100, entityTypes: ['thread', 'project'] },
  { key: 'project', label: 'Проект', defaultWidth: 200, minWidth: 120, entityTypes: ['thread'] },
  { key: 'deadline', label: 'Дедлайн', defaultWidth: 130, minWidth: 100, entityTypes: ['thread', 'project'] },
  { key: 'assignees', label: 'Исполнители', defaultWidth: 140, minWidth: 100, entityTypes: ['thread'] },
  { key: 'is_pinned', label: 'Закреп', defaultWidth: 80, minWidth: 60, entityTypes: ['thread'] },
  { key: 'last_message_at', label: 'Последнее сообщение', defaultWidth: 160, minWidth: 120, entityTypes: ['thread'] },
  { key: 'unread', label: 'Непрочитанные', defaultWidth: 120, minWidth: 90, entityTypes: ['thread'] },
  { key: 'template', label: 'Шаблон', defaultWidth: 160, minWidth: 100, entityTypes: ['project'] },
  { key: 'next_task_deadline', label: 'Ближайшая задача', defaultWidth: 160, minWidth: 120, entityTypes: ['project'] },
  { key: 'participants', label: 'Участники', defaultWidth: 140, minWidth: 100, entityTypes: ['project'] },
  { key: 'created_at', label: 'Создано', defaultWidth: 130, minWidth: 100, entityTypes: ['thread', 'project'] },
  { key: 'updated_at', label: 'Обновлено', defaultWidth: 130, minWidth: 100, entityTypes: ['thread', 'project'] },
]

export function getColumnsForEntity(entityType: 'thread' | 'project'): ColumnDef[] {
  return ALL_COLUMNS.filter((c) => c.entityTypes.includes(entityType))
}

export function getColumnDef(key: string): ColumnDef | undefined {
  return ALL_COLUMNS.find((c) => c.key === key)
}

/**
 * Дефолтная конфигурация колонок для нового списка. Включаем чекбокс (всегда),
 * название и ключевые поля типа.
 */
export function defaultColumnsForEntity(entityType: 'thread' | 'project') {
  const keys: ItemListColumnKey[] =
    entityType === 'thread'
      ? ['name', 'status', 'project', 'deadline', 'assignees']
      : ['name', 'status', 'template', 'deadline', 'participants']
  return keys.map((key, order) => {
    const def = getColumnDef(key)!
    return { key, width: def.defaultWidth, order, visible: true }
  })
}
