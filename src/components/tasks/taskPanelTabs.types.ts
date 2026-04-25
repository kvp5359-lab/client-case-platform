/**
 * Типы вкладок боковой панели треда (TaskPanel).
 *
 * Каждая вкладка — параллельный «открытый контекст» в правой панели.
 * Активна всегда одна. Состояние персистится в БД (task_panel_tabs)
 * и в URL (`?panelTab=...`).
 */

export type TaskPanelTabType =
  | 'thread'      // отдельный тред (чат/задача/документ): refId = threadId
  | 'tasks'       // список задач проекта (Режим 2 старого TaskPanel)
  | 'documents'   // документы проекта (PanelDocumentsContent)
  | 'history'     // сквозная история (AllHistoryContent)
  | 'forms'       // анкеты проекта (заглушка для будущего)
  | 'materials'   // полезные материалы (заглушка для будущего)
  | 'assistant'   // AI-ассистент (AiPanelContent)
  | 'extra'       // дополнительно (ExtraPanelContent)

export interface TaskPanelTab {
  /** Стабильный id вкладки. Для thread: `thread:${threadId}`, для системных: тип ('tasks', 'history' и т.д.). */
  id: string
  type: TaskPanelTabType
  /** Для type='thread' — id треда. Для остальных не используется. */
  refId?: string
  /** Заголовок для отображения во вкладке. */
  title: string
  /** Дополнительные данные для рендера вкладки (иконка, акцент, тип треда). */
  meta?: {
    /** task | chat | email — определяет иконку вкладки треда. */
    threadType?: string
    /** Имя кастомной иконки треда (из THREAD_ICONS) — если задана. */
    icon?: string | null
    /** Акцентный цвет треда (для подсветки активной вкладки). */
    accentColor?: string | null
  }
}

/** Канонический id для вкладки заданного типа/refId. */
export function makeTabId(type: TaskPanelTabType, refId?: string): string {
  return type === 'thread' && refId ? `thread:${refId}` : type
}
