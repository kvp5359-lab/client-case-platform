/**
 * Быстрые действия («+») — настраиваемые кнопки создания объектов из любого места.
 * Хранятся в `interface_presets.config.quick_actions` активного профиля настроек.
 */

export type QuickActionKind =
  | 'new_project'
  | 'new_thread'
  | 'new_contact'
  | 'new_transaction'
  | 'open_route'

export type QuickAction = {
  id: string
  label: string
  /** Значение из THREAD_ICONS (резолвится getChatIconComponent). */
  icon: string
  kind: QuickActionKind
  /** new_project: шаблон проекта (null = пустой проект). */
  projectTemplateId?: string | null
  /** new_thread: шаблон треда. */
  threadTemplateId?: string | null
  /** new_thread: целевой проект (null = «Без проекта»). */
  targetProjectId?: string | null
  /** new_contact: роль по умолчанию. */
  defaultRole?: string | null
  /** new_transaction: доход или расход (дефолт — расход).
   *  Видимость действия гейтится правом view_finance (см. QuickActionSlotButton). */
  transactionType?: 'income' | 'expense' | null
  /** open_route: путь относительно воркспейса, напр. 'calendar' или 'inbox'. */
  route?: string | null
}

export const QUICK_ACTION_KIND_LABELS: Record<QuickActionKind, string> = {
  new_project: 'Новый проект',
  new_thread: 'Новый тред',
  new_contact: 'Новый контакт',
  new_transaction: 'Доход / расход',
  open_route: 'Открыть раздел',
}

export const DEFAULT_QUICK_ACTION_ICON: Record<QuickActionKind, string> = {
  new_project: 'briefcase',
  new_thread: 'message-square',
  new_contact: 'users',
  new_transaction: 'wallet',
  open_route: 'globe',
}
