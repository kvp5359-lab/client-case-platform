/**
 * Дефолтные вкладки боковой панели проекта — формат хранения в
 * `project_templates.default_panel_tabs` (jsonb).
 *
 * NULL → старое поведение (хардкод: tasks + history).
 * []   → ничего не закреплять у нового проекта.
 * [...] → закрепить эти вкладки в указанном порядке.
 */

export type SystemPanelTabKey =
  | 'tasks'
  | 'documents'
  | 'history'
  | 'forms'
  | 'materials'
  | 'assistant'
  | 'project_context'

export type DefaultPanelTabItem =
  | { type: 'system'; key: SystemPanelTabKey }
  | { type: 'thread_template'; id: string }

/** Лейблы системных вкладок — единый источник для редактора и сеялки. */
export const SYSTEM_PANEL_TAB_LABELS: Record<SystemPanelTabKey, string> = {
  tasks: 'Задачи',
  documents: 'Документы',
  history: 'История',
  forms: 'Анкеты',
  materials: 'Полезные материалы',
  assistant: 'AI-ассистент',
  project_context: 'Заметки',
}

export function isDefaultPanelTabsArray(value: unknown): value is DefaultPanelTabItem[] {
  if (!Array.isArray(value)) return false
  return value.every((item) => {
    if (!item || typeof item !== 'object') return false
    const t = (item as { type?: unknown }).type
    if (t === 'system') return typeof (item as { key?: unknown }).key === 'string'
    if (t === 'thread_template') return typeof (item as { id?: unknown }).id === 'string'
    return false
  })
}
