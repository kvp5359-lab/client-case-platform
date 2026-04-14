/**
 * Конфиги для <ListSettingsDialog>: справочники сортировки, группировки,
 * видимых полей для задач и проектов. Вынесено из ListSettingsDialog.tsx
 * в отдельный файл, чтобы главный компонент не был «стеной констант».
 */

import type {
  SortField,
  SortDir,
  VisibleField,
  GroupByField,
  CardFieldId,
  CardFieldStyle,
  CardLayout,
  CardFieldPlacement,
} from './types'

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
  { value: 'deadline', label: 'Дедлайн' },
  { value: 'template', label: 'Шаблон' },
]

/** По умолчанию показываемые поля для типа списка. */
export function defaultVisibleFields(entityType: 'task' | 'project' | 'inbox'): VisibleField[] {
  if (entityType === 'inbox') return []
  return entityType === 'project'
    ? ['status', 'template']
    : ['status', 'deadline', 'assignees', 'project']
}

// ── Card Layout: определения полей ──────────────────────

export interface CardFieldDef {
  id: CardFieldId
  label: string
  entityTypes: Array<'task' | 'project'>
}

export const CARD_FIELD_DEFS: CardFieldDef[] = [
  { id: 'status',    label: 'Статус',        entityTypes: ['task'] },
  { id: 'icon',      label: 'Иконка',        entityTypes: ['project'] },
  { id: 'name',      label: 'Название',      entityTypes: ['task', 'project'] },
  { id: 'deadline',  label: 'Дедлайн',       entityTypes: ['task', 'project'] },
  { id: 'assignees', label: 'Исполнители',   entityTypes: ['task'] },
  { id: 'project',   label: 'Проект',        entityTypes: ['task'] },
  { id: 'template',  label: 'Шаблон',        entityTypes: ['project'] },
  { id: 'unread',    label: 'Непрочитанные', entityTypes: ['task'] },
]

export function getFieldDefsForEntity(entityType: 'task' | 'project'): CardFieldDef[] {
  return CARD_FIELD_DEFS.filter((f) => f.entityTypes.includes(entityType))
}

export function getFieldLabel(fieldId: CardFieldId): string {
  return CARD_FIELD_DEFS.find((f) => f.id === fieldId)?.label ?? fieldId
}

// ── Дефолтные layout-ы ──────────────────────────────────

const S: CardFieldStyle = { fontSize: 'sm', align: 'left', truncate: 'truncate', bold: false }
const M: CardFieldStyle = { fontSize: 'md', align: 'left', truncate: 'truncate', bold: false }
const SR: CardFieldStyle = { fontSize: 'sm', align: 'right', truncate: 'truncate', bold: false }

function fp(fieldId: CardFieldId, visible: boolean, style: CardFieldStyle): CardFieldPlacement {
  return { fieldId, visible, style }
}

export function defaultCardLayout(entityType: 'task' | 'project' | 'inbox'): CardLayout {
  if (entityType === 'project') {
    return {
      version: 1,
      rows: [
        {
          id: 'row-default-0',
          fields: [
            fp('icon', true, S),
            fp('name', true, M),
            fp('deadline', true, SR),
            fp('template', true, SR),
          ],
        },
      ],
    }
  }
  // task (inbox не использует layout — вернём задачный как fallback)
  return {
    version: 1,
    rows: [
      {
        id: 'row-default-0',
        fields: [
          fp('status', true, S),
          fp('name', true, M),
          fp('assignees', true, SR),
          fp('unread', true, SR),
        ],
      },
      {
        id: 'row-default-1',
        fields: [
          fp('project', true, S),
          fp('deadline', true, SR),
        ],
      },
    ],
  }
}
