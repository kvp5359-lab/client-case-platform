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
  MailQuestion,
  CalendarDays,
  BarChart3,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { WorkspacePermission } from '@/types/permissions'

export type SidebarNavKey =
  | 'home'
  | 'inbox'
  | 'inbox_unmatched'
  | 'tasks'
  | 'calendar'
  | 'boards'
  | 'knowledge_base'
  | 'people'
  | 'templates'
  | 'digests'
  | 'reports'
  | 'finance'
  | 'settings'

export type SidebarPlacement = 'topbar' | 'list'

export type SidebarBadgeMode =
  | 'disabled'
  | 'my_active_tasks'
  | 'all_my_tasks'
  | 'overdue_tasks'
  | 'unread_messages'
  | 'unread_threads'
  | 'unread_personal_dialogs'

export type SidebarBadgeColor =
  | 'default'
  | 'red'
  | 'orange'
  | 'amber'
  | 'green'
  | 'blue'
  | 'violet'
  | 'gray'

export type SidebarSlot = {
  /**
   * Уникальный id ЭКЗЕМПЛЯРА слота. Для слотов, созданных перетаскиванием из
   * палитры — `slot:<uuid>` (чтобы один пункт можно было разместить несколько
   * раз). Легаси-слоты имеют id, совпадающий со ссылкой (`board:<uuid>` и т.п.).
   */
  id: string
  /**
   * На что ссылается слот: 'nav:<key>' | 'board:<uuid>' | 'list:<uuid>' |
   * 'section:<uuid>' | 'quickaction:<id>'. Если не задан — ссылкой считается
   * сам `id` (легаси). Для folder/link не используется (они самодостаточны).
   */
  ref?: string | null
  type: 'nav' | 'board' | 'list' | 'section' | 'folder' | 'quickaction' | 'link'
  placement: SidebarPlacement
  order: number
  badge_mode: SidebarBadgeMode
  /** Цветовой акцент бейджа. Если не задан или 'default' — используется
   *  исторический красный (`bg-red-500` / `bg-red-100 text-red-600`). */
  badge_color?: SidebarBadgeColor
  /**
   * Если задано — слот вложен в папку (значение = id слота-папки). 1 уровень
   * вложенности: папка не может быть в папке. Для слотов верхнего уровня
   * не задано (undefined/null).
   */
  parent_id?: string | null
  /** Имя папки (type='folder') или подпись ссылки (type='link'). */
  name?: string
  /** Имя lucide-иконки для папки (опционально, дефолт — Folder). */
  folder_icon?: string
  /** URL ссылки (только для type='link'). Абсолютный (http…) → внешняя вкладка,
   *  относительный → путь внутри воркспейса. */
  url?: string
  /** Значение иконки из THREAD_ICONS (только для type='link'). */
  link_icon?: string
}

export type SidebarSettingsRow = {
  workspace_id: string
  slots: SidebarSlot[]
  updated_at: string
  updated_by: string | null
}

export type SidebarItemMeta = {
  key: SidebarNavKey
  label: string
  icon: LucideIcon
  /** Относительный путь (после `/workspaces/<id>/`). Пустая строка = корень воркспейса. */
  path: string
  hasAccess: (ctx: SidebarPermissionsCtx) => boolean
}

export type SidebarPermissionsCtx = {
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
  inbox_unmatched: {
    key: 'inbox_unmatched',
    label: 'Нераспознанные письма',
    icon: MailQuestion,
    path: 'inbox/unmatched',
    hasAccess: ({ isClientOnly, isOwner, hasPermission }) =>
      !isClientOnly && (isOwner || hasPermission('manage_workspace_settings')),
  },
  tasks: {
    key: 'tasks',
    label: 'Задачи',
    icon: CheckSquare,
    path: 'tasks',
    hasAccess: ({ isClientOnly }) => !isClientOnly,
  },
  calendar: {
    key: 'calendar',
    label: 'Календарь',
    icon: CalendarDays,
    path: 'calendar',
    hasAccess: ({ isClientOnly }) => !isClientOnly,
  },
  boards: {
    key: 'boards',
    label: 'Доски и списки',
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
  reports: {
    key: 'reports',
    label: 'Отчёты',
    icon: BarChart3,
    path: 'reports',
    hasAccess: ({ isClientOnly }) => !isClientOnly,
  },
  finance: {
    key: 'finance',
    label: 'Финансы',
    icon: Wallet,
    path: 'finance',
    hasAccess: ({ isClientOnly, isOwner, hasPermission }) =>
      !isClientOnly && (isOwner || hasPermission('manage_workspace_settings')),
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
  'inbox_unmatched',
  'tasks',
  'calendar',
  'boards',
  'knowledge_base',
  'people',
  'templates',
  'digests',
  'reports',
  'finance',
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
  { id: 'nav:digests', type: 'nav', placement: 'list', order: 4, badge_mode: 'disabled' },
]

export type BadgeModeMeta = {
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
  {
    value: 'unread_personal_dialogs',
    label: 'Непрочитанные личные диалоги',
    description: 'Число личных диалогов (TG/Wazzup/Email), в которых есть непрочитанные сообщения.',
  },
]

/** Палитра цветовых акцентов для бейджей в сайдбаре. */
export type BadgeColorMeta = {
  value: SidebarBadgeColor
  label: string
  /** HEX swatch для отображения в селекторе цвета. */
  swatch: string
  /** Tailwind-классы для round-бейджа на иконке (топбар, compact). */
  roundClasses: string
  /** Tailwind-классы для прямоугольного бейджа в строке (список). */
  pillClasses: string
}

export const BADGE_COLORS: BadgeColorMeta[] = [
  {
    value: 'default',
    label: 'По умолчанию',
    swatch: '#ef4444',
    roundClasses: 'bg-red-500 text-white',
    pillClasses: 'bg-red-100 text-red-600',
  },
  {
    value: 'red',
    label: 'Красный',
    swatch: '#ef4444',
    roundClasses: 'bg-red-500 text-white',
    pillClasses: 'bg-red-100 text-red-600',
  },
  {
    value: 'orange',
    label: 'Оранжевый',
    swatch: '#f97316',
    roundClasses: 'bg-orange-500 text-white',
    pillClasses: 'bg-orange-100 text-orange-600',
  },
  {
    value: 'amber',
    label: 'Жёлтый',
    swatch: '#f59e0b',
    roundClasses: 'bg-amber-500 text-white',
    pillClasses: 'bg-amber-100 text-amber-700',
  },
  {
    value: 'green',
    label: 'Зелёный',
    swatch: '#22c55e',
    roundClasses: 'bg-green-500 text-white',
    pillClasses: 'bg-green-100 text-green-700',
  },
  {
    value: 'blue',
    label: 'Синий',
    swatch: '#3b82f6',
    roundClasses: 'bg-blue-500 text-white',
    pillClasses: 'bg-blue-100 text-blue-600',
  },
  {
    value: 'violet',
    label: 'Фиолетовый',
    swatch: '#8b5cf6',
    roundClasses: 'bg-violet-500 text-white',
    pillClasses: 'bg-violet-100 text-violet-700',
  },
  {
    value: 'gray',
    label: 'Серый',
    swatch: '#6b7280',
    roundClasses: 'bg-gray-500 text-white',
    pillClasses: 'bg-gray-200 text-gray-700',
  },
]

const BADGE_COLOR_MAP = new Map<SidebarBadgeColor, BadgeColorMeta>(
  BADGE_COLORS.map((c) => [c.value, c]),
)

export function getBadgeColorMeta(color: SidebarBadgeColor | undefined): BadgeColorMeta {
  return BADGE_COLOR_MAP.get(color ?? 'default') ?? BADGE_COLORS[0]
}

const VALID_BADGE_COLORS = new Set<string>(BADGE_COLORS.map((c) => c.value))
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
    const type =
      obj.type === 'nav' || obj.type === 'board' || obj.type === 'list' ||
      obj.type === 'section' || obj.type === 'folder' || obj.type === 'quickaction' ||
      obj.type === 'link'
        ? obj.type
        : null
    const placement =
      obj.placement === 'topbar' || obj.placement === 'list' ? obj.placement : null
    const order = typeof obj.order === 'number' ? obj.order : out.length
    const badgeMode =
      typeof obj.badge_mode === 'string' && VALID_BADGE_MODES.has(obj.badge_mode)
        ? (obj.badge_mode as SidebarBadgeMode)
        : 'disabled'
    if (!id || !type || !placement) continue
    // Ссылка слота: явный ref, иначе сам id (легаси). Валидируем именно ссылку —
    // id экземпляра может быть произвольным (`slot:<uuid>`), если задан ref.
    const refRaw = typeof obj.ref === 'string' && obj.ref ? obj.ref : null
    const refStr = refRaw ?? id
    // Валидация по типу (folder/link — самодостаточны, валидируем по id).
    if (type === 'nav') {
      const key = refStr.startsWith('nav:') ? refStr.slice(4) : null
      if (!key || !VALID_NAV_KEYS.has(key)) continue
    } else if (type === 'board') {
      const uuid = refStr.startsWith('board:') ? refStr.slice(6) : null
      if (!uuid || !UUID_RE.test(uuid)) continue
    } else if (type === 'list') {
      const uuid = refStr.startsWith('list:') ? refStr.slice(5) : null
      if (!uuid || !UUID_RE.test(uuid)) continue
    } else if (type === 'section') {
      const uuid = refStr.startsWith('section:') ? refStr.slice(8) : null
      if (!uuid || !UUID_RE.test(uuid)) continue
    } else if (type === 'quickaction') {
      // ref = 'quickaction:<actionId>'; actionId — произвольный непустой (не строго UUID).
      const actionId = refStr.startsWith('quickaction:') ? refStr.slice(12) : null
      if (!actionId) continue
    } else if (type === 'link') {
      const uuid = id.startsWith('link:') ? id.slice(5) : null
      if (!uuid || !UUID_RE.test(uuid)) continue
    } else {
      // type === 'folder'
      const uuid = id.startsWith('folder:') ? id.slice(7) : null
      if (!uuid || !UUID_RE.test(uuid)) continue
    }
    const slot: SidebarSlot = { id, type, placement, order, badge_mode: badgeMode }
    // Сохраняем ref только если он отличается от id (легаси-слоты без ref).
    if (refRaw && refRaw !== id && type !== 'folder' && type !== 'link') {
      slot.ref = refRaw
    }
    if (typeof obj.badge_color === 'string' && VALID_BADGE_COLORS.has(obj.badge_color)) {
      slot.badge_color = obj.badge_color as SidebarBadgeColor
    }
    if (typeof obj.parent_id === 'string' && obj.parent_id.startsWith('folder:')) {
      slot.parent_id = obj.parent_id
    }
    if (type === 'folder') {
      slot.name = typeof obj.name === 'string' && obj.name.trim() ? obj.name : 'Папка'
      if (typeof obj.folder_icon === 'string') slot.folder_icon = obj.folder_icon
      // Папка не может быть в папке — гарантируем.
      slot.parent_id = null
    }
    if (type === 'link') {
      slot.name = typeof obj.name === 'string' && obj.name.trim() ? obj.name : 'Ссылка'
      slot.url = typeof obj.url === 'string' ? obj.url : ''
      if (typeof obj.link_icon === 'string') slot.link_icon = obj.link_icon
    }
    out.push(slot)
  }
  // Втора стадия: parent_id должен указывать на существующий слот type='folder'
  // ровно той же placement (зоны). Иначе сбрасываем в верхний уровень.
  const folderIds = new Set(out.filter((s) => s.type === 'folder').map((s) => s.id))
  const folderPlacement = new Map(out.filter((s) => s.type === 'folder').map((s) => [s.id, s.placement]))
  for (const s of out) {
    if (!s.parent_id) continue
    if (!folderIds.has(s.parent_id) || folderPlacement.get(s.parent_id) !== s.placement) {
      s.parent_id = null
    }
  }
  // Сортируем по существующим order (важно для JSONB) и перенумеровываем.
  out.sort((a, b) => a.order - b.order)
  return reorderWithinZones(out)
}

/**
 * Перенумеровывает order=0..n-1 внутри каждой группы (placement + parent_id),
 * СОХРАНЯЯ текущий порядок элементов в массиве. Не сортирует — вызывающий
 * код должен передать массив уже в желаемой последовательности (после swap,
 * filter, push и т.п.).
 */
export function reorderWithinZones(slots: SidebarSlot[]): SidebarSlot[] {
  const counters = new Map<string, number>()
  return slots.map((s) => {
    const key = `${s.placement}:${s.parent_id ?? ''}`
    const next = (counters.get(key) ?? 0)
    counters.set(key, next + 1)
    return { ...s, order: next }
  })
}

/** Слоты верхнего уровня (не вложенные в папку). */
export function topLevelSlots(slots: SidebarSlot[]): SidebarSlot[] {
  return slots.filter((s) => !s.parent_id)
}

/** Дети указанной папки. */
export function childrenOfFolder(slots: SidebarSlot[], folderId: string): SidebarSlot[] {
  return slots.filter((s) => s.parent_id === folderId)
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

/** Извлекает item_list uuid из id вида 'list:<uuid>'. */
export function listIdFromSlotId(id: string): string | null {
  if (!id.startsWith('list:')) return null
  return id.slice(5)
}

/** Извлекает section uuid из id вида 'section:<uuid>'. */
export function sectionIdFromSlotId(id: string): string | null {
  if (!id.startsWith('section:')) return null
  return id.slice(8)
}

/** Извлекает id быстрого действия из id вида 'quickaction:<actionId>'. */
export function quickActionIdFromSlotId(id: string): string | null {
  if (!id.startsWith('quickaction:')) return null
  return id.slice(12)
}

/**
 * Ссылка слота — строка `nav:…`/`board:…`/`list:…`/`section:…`/`quickaction:…`,
 * по которой резолвится сущность. Для легаси-слотов без `ref` это сам `id`.
 * ВСЕ парсеры id (navKeyFromSlotId, boardIdFromSlotId, …) применять к ней.
 */
export function slotRef(slot: { id: string; ref?: string | null }): string {
  return slot.ref && slot.ref.length > 0 ? slot.ref : slot.id
}

/** Форматирует число в badge-строку (>99 → "99+"). undefined если 0/нет. */
export function formatBadgeCount(count: number | undefined): string | undefined {
  if (!count || count <= 0) return undefined
  return count > 99 ? '99+' : String(count)
}
