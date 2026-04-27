/**
 * Настройки сайдбара воркспейса — типы, константы, дефолты, хелперы.
 *
 * Единая модель: `slots` — список размещённых элементов (пункты меню или доски).
 * Каждый слот указывает зону размещения (`topbar` | `list`), порядок внутри зоны
 * и режим бейджа. Элементы, которых нет в `slots`, считаются «доступными»
 * (показываются в настройках в отдельной секции и не выводятся в сайдбаре).
 */

import {
  Home,
  Inbox,
  CheckSquare,
  Users,
  Layout,
  Settings as SettingsIcon,
  BookOpen,
  Kanban,
  NotebookText,
  type LucideIcon,
} from 'lucide-react'
import type { WorkspacePermission } from '@/types/permissions'

export type SidebarNavKey =
  | 'home'
  | 'inbox'
  | 'tasks'
  | 'boards'
  | 'knowledge_base'
  | 'people'
  | 'templates'
  | 'digests'
  | 'settings'

export type SidebarPlacement = 'topbar' | 'list'

export type SidebarBadgeMode =
  | 'disabled'
  | 'my_active_tasks'
  | 'all_my_tasks'
  | 'overdue_tasks'
  | 'unread_messages'
  | 'unread_threads'

export interface SidebarSlot {
  id: string // 'nav:<key>' | 'board:<uuid>'
  type: 'nav' | 'board'
  placement: SidebarPlacement
  order: number
  badge_mode: SidebarBadgeMode
}

export interface SidebarSettingsRow {
  workspace_id: string
  slots: SidebarSlot[]
  updated_at: string
  updated_by: string | null
}

export interface SidebarItemMeta {
  key: SidebarNavKey
  label: string
  icon: LucideIcon
  /** Относительный путь (после `/workspaces/<id>/`). Пустая строка = корень воркспейса. */
  path: string
  hasAccess: (ctx: SidebarPermissionsCtx) => boolean
}

export interface SidebarPermissionsCtx {
  isOwner: boolean
  isClientOnly: boolean
  hasPermission: (perm: WorkspacePermission) => boolean
}

export const SIDEBAR_NAV_ITEMS: Record<SidebarNavKey, SidebarItemMeta> = {
  home: {
    key: 'home',
    label: 'Главная',
    icon: Home,
    path: '',
    hasAccess: () => true,
  },
  inbox: {
    key: 'inbox',
    label: 'Входящие',
    icon: Inbox,
    path: 'inbox',
    hasAccess: ({ isClientOnly }) => !isClientOnly,
  },
  tasks: {
    key: 'tasks',
    label: 'Задачи',
    icon: CheckSquare,
    path: 'tasks',
    hasAccess: ({ isClientOnly }) => !isClientOnly,
  },
  boards: {
    key: 'boards',
    label: 'Доски',
    icon: Kanban,
    path: 'boards',
    hasAccess: ({ isClientOnly }) => !isClientOnly,
  },
  knowledge_base: {
    key: 'knowledge_base',
    label: 'База знаний',
    icon: BookOpen,
    path: 'settings/knowledge-base',
    hasAccess: ({ isClientOnly, hasPermission }) =>
      !isClientOnly &&
      (hasPermission('view_knowledge_base') ||
        hasPermission('manage_knowledge_base') ||
        hasPermission('manage_templates')),
  },
  people: {
    key: 'people',
    label: 'Люди',
    icon: Users,
    path: 'settings/participants',
    hasAccess: ({ isClientOnly, hasPermission }) =>
      !isClientOnly && hasPermission('manage_participants'),
  },
  templates: {
    key: 'templates',
    label: 'Шаблоны',
    icon: Layout,
    path: 'settings/templates/project-templates',
    hasAccess: ({ isClientOnly, hasPermission }) =>
      !isClientOnly && hasPermission('manage_templates'),
  },
  digests: {
    key: 'digests',
    label: 'Дневник',
    icon: NotebookText,
    path: 'digests',
    hasAccess: ({ isClientOnly, hasPermission }) =>
      !isClientOnly && hasPermission('view_workspace_digest'),
  },
  settings: {
    key: 'settings',
    label: 'Настройки',
    icon: SettingsIcon,
    path: 'settings',
    hasAccess: ({ isClientOnly, isOwner, hasPermission }) =>
      !isClientOnly && (isOwner || hasPermission('manage_workspace_settings')),
  },
}

export const SIDEBAR_NAV_KEYS: SidebarNavKey[] = [
  'home',
  'inbox',
  'tasks',
  'boards',
  'knowledge_base',
  'people',
  'templates',
  'digests',
  'settings',
]

/** Дефолтная конфигурация для нового воркспейса (совпадает с дефолтом миграции). */
export const DEFAULT_SIDEBAR_SLOTS: SidebarSlot[] = [
  { id: 'nav:home', type: 'nav', placement: 'topbar', order: 0, badge_mode: 'disabled' },
  { id: 'nav:knowledge_base', type: 'nav', placement: 'topbar', order: 1, badge_mode: 'disabled' },
  { id: 'nav:people', type: 'nav', placement: 'topbar', order: 2, badge_mode: 'disabled' },
  { id: 'nav:templates', type: 'nav', placement: 'topbar', order: 3, badge_mode: 'disabled' },
  { id: 'nav:settings', type: 'nav', placement: 'topbar', order: 4, badge_mode: 'disabled' },
  { id: 'nav:inbox', type: 'nav', placement: 'list', order: 0, badge_mode: 'unread_threads' },
  { id: 'nav:tasks', type: 'nav', placement: 'list', order: 1, badge_mode: 'my_active_tasks' },
  { id: 'nav:boards', type: 'nav', placement: 'list', order: 2, badge_mode: 'disabled' },
  { id: 'nav:digests', type: 'nav', placement: 'list', order: 3, badge_mode: 'disabled' },
]

/** Мягкий лимит на количество иконок в топ-баре. Превышение — только предупреждение. */
export const TOPBAR_SOFT_LIMIT = 6

export interface BadgeModeMeta {
  value: SidebarBadgeMode
  label: string
  description: string
}

export const BADGE_MODES: BadgeModeMeta[] = [
  { value: 'disabled', label: 'Без бейджа', description: 'Без счётчика — спокойнее визуально.' },
  {
    value: 'my_active_tasks',
    label: 'Задачи на сегодня',
    description: 'На сегодня + просроченные. Глобальный счётчик по воркспейсу.',
  },
  {
    value: 'all_my_tasks',
    label: 'Все мои задачи',
    description: 'Общий бэклог моих задач без фильтра по дате.',
  },
  {
    value: 'overdue_tasks',
    label: 'Просроченные задачи',
    description: 'Только задачи с дедлайном в прошлом.',
  },
  {
    value: 'unread_messages',
    label: 'Непрочитанные сообщения',
    description: 'Сумма непрочитанных сообщений во всех доступных тредах.',
  },
  {
    value: 'unread_threads',
    label: 'Непрочитанные треды',
    description: 'Число тредов, в которых есть хотя бы одно непрочитанное сообщение.',
  },
]

const VALID_BADGE_MODES = new Set<string>(BADGE_MODES.map((m) => m.value))
const VALID_NAV_KEYS = new Set<string>(SIDEBAR_NAV_KEYS)
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/** Нормализует слоты из БД: фильтрует мусор, перенумеровывает order внутри каждой зоны. */
export function normalizeSidebarSlots(raw: unknown): SidebarSlot[] {
  if (!Array.isArray(raw)) return []
  const out: SidebarSlot[] = []
  for (const item of raw as unknown[]) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    const id = typeof obj.id === 'string' ? obj.id : null
    const type = obj.type === 'nav' || obj.type === 'board' ? obj.type : null
    const placement =
      obj.placement === 'topbar' || obj.placement === 'list' ? obj.placement : null
    const order = typeof obj.order === 'number' ? obj.order : out.length
    const badgeMode =
      typeof obj.badge_mode === 'string' && VALID_BADGE_MODES.has(obj.badge_mode)
        ? (obj.badge_mode as SidebarBadgeMode)
        : 'disabled'
    if (!id || !type || !placement) continue
    // Валидация по типу.
    if (type === 'nav') {
      const key = id.startsWith('nav:') ? id.slice(4) : null
      if (!key || !VALID_NAV_KEYS.has(key)) continue
    } else {
      const uuid = id.startsWith('board:') ? id.slice(6) : null
      if (!uuid || !UUID_RE.test(uuid)) continue
    }
    out.push({ id, type, placement, order, badge_mode: badgeMode })
  }
  // Перенумеровка order внутри каждой зоны, чтобы значения были подряд.
  return reorderWithinZones(out)
}

/** Возвращает массив со сплошной нумерацией order=0..n-1 внутри каждой зоны (порядок сохранён). */
export function reorderWithinZones(slots: SidebarSlot[]): SidebarSlot[] {
  const sorted = [...slots].sort((a, b) => a.order - b.order)
  const counters: Record<SidebarPlacement, number> = { topbar: 0, list: 0 }
  return sorted.map((s) => ({ ...s, order: counters[s.placement]++ }))
}

/** Группирует слоты по зонам в порядке `order` для рендера. */
export function groupSlots(slots: SidebarSlot[]) {
  const sorted = [...slots].sort((a, b) => a.order - b.order)
  return {
    topbar: sorted.filter((it) => it.placement === 'topbar'),
    list: sorted.filter((it) => it.placement === 'list'),
  }
}

/** Извлекает navKey из id вида 'nav:<key>'. Возвращает null если это не nav-слот. */
export function navKeyFromSlotId(id: string): SidebarNavKey | null {
  if (!id.startsWith('nav:')) return null
  const key = id.slice(4)
  return VALID_NAV_KEYS.has(key) ? (key as SidebarNavKey) : null
}

/** Извлекает board uuid из id вида 'board:<uuid>'. */
export function boardIdFromSlotId(id: string): string | null {
  if (!id.startsWith('board:')) return null
  return id.slice(6)
}

/** Форматирует число в badge-строку (>99 → "99+"). undefined если 0/нет. */
export function formatBadgeCount(count: number | undefined): string | undefined {
  if (!count || count <= 0) return undefined
  return count > 99 ? '99+' : String(count)
}
