import type { AiSources } from '@/services/api/messenger/messengerAiService'

export type PanelTab = 'client' | 'internal' | 'assistant' | 'extra'
export type PanelType = 'ai' | 'messenger'

export interface AiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sourceTags?: string[]
  created_at: string
}

export interface PendingMessengerDocuments {
  ids: string[]
  channel: 'client' | 'internal'
}

export interface PendingForwardMessage {
  senderName: string
  content: string
  attachments?: Array<{
    file_name: string
    file_size: number | null
    mime_type: string | null
    storage_path: string
    file_id: string | null
  }>
  targetChatId: string
}

export interface PanelContext {
  workspaceId: string | null
  projectId?: string
  templateId?: string
}

/** Per-project AI session state (survives panel close/open) */
export interface AiSessionState {
  activeConversationId: string | null
  aiMessages: AiMessage[]
  sources: AiSources
  /** Тексты прикреплённых документов — сохраняются между сообщениями в диалоге */
  sessionDocs?: Record<string, { name: string; text: string }>
}

export interface PendingAiDocumentItem {
  id: string
  name: string
  textContent?: string | null
}

export const DEFAULT_AI_SOURCES: AiSources = {
  clientMessages: true,
  teamMessages: false,
  formData: false,
  documents: false,
  knowledge: null,
}

export interface SidePanelStore {
  /** Активная вкладка панели (null = закрыта) */
  panelTab: PanelTab | null
  /** Последняя открытая вкладка (для восстановления при повторном открытии) */
  lastPanelTab: PanelTab

  /** Контекст текущей страницы (постоянный, пока мы на ProjectPage) */
  pageContext: PanelContext

  /**
   * Доступность объединённого модуля `threads` на текущей странице.
   * Он включает таб задач и обе мессенджер-панели (клиент + команда) —
   * если флаг false, кнопки открытия мессенджера скрываются.
   */
  threadsEnabled: boolean

  /** Активная вкладка AI-панели (sub-tab внутри assistant) */
  activeAiTab: string | null

  /** AI-сессии по projectId (сохраняются при закрытии панели) */
  aiSessions: Record<string, AiSessionState>

  /** Документы для прокидывания в AI-ассистент */
  pendingAiDocuments: PendingAiDocumentItem[]

  /** Документы для прокидывания в мессенджер (клиент/команда) */
  pendingMessengerDocuments: PendingMessengerDocuments | null

  /** Открыть панель на вкладке */
  openPanel: (tab: PanelTab) => void
  /** Закрыть панель */
  closePanel: () => void
  /** Переключить вкладку (или закрыть если та же) */
  togglePanel: (tab: PanelTab) => void

  /** Открыть AI-панель */
  openAI: (ctx?: { projectId?: string; templateId?: string }) => void
  /** Канал мессенджера, запрошенный извне (из бейджа) */
  requestedMessengerChannel: 'client' | 'internal' | null
  /** Открыть мессенджер */
  openMessenger: (channel?: 'client' | 'internal') => void
  /** Сбросить запрошенный канал (после применения) */
  clearRequestedMessengerChannel: () => void
  /** Установить контекст страницы (вызывается из ProjectPage/WorkspaceLayout) */
  setContext: (ctx: Partial<PanelContext>) => void
  setThreadsEnabled: (enabled: boolean) => void
  setActiveAiTab: (tab: string) => void
  /** Получить или создать AI-сессию для проекта */
  getAiSession: (projectId: string) => AiSessionState
  /** Обновить AI-сессию для проекта */
  updateAiSession: (projectId: string, patch: Partial<AiSessionState>) => void
  /** Открыть ассистент с документами */
  openAssistantWithDocuments: (docs: PendingAiDocumentItem[]) => void
  clearPendingAiDocuments: () => void

  /** Открыть мессенджер с документами */
  sendDocumentsToMessenger: (ids: string[], channel: 'client' | 'internal') => void
  clearPendingMessengerDocuments: () => void

  /** Переслать сообщение в другой канал */
  pendingForwardMessage: PendingForwardMessage | null
  forwardMessageToChannel: (msg: PendingForwardMessage) => void
  clearPendingForwardMessage: () => void

  /** Активный chatId для гибких чатов (project_chats.id) */
  activeChatId: string | null
  /** Открыть конкретный чат по chatId */
  openChat: (chatId: string, channel?: 'client' | 'internal') => void
  /** Восстановить activeChatId для проекта из localStorage */
  restoreActiveChatId: (projectId: string) => void

  /** Pending first message — shown optimistically when chat is created with initial message */
  pendingInitialMessage: PendingInitialMessage | null
  setPendingInitialMessage: (msg: PendingInitialMessage | null) => void

  /** Полный сброс стора — вызывается при logout, чтобы не осталось данных предыдущего пользователя */
  reset: () => void
}

export interface PendingInitialMessage {
  threadId: string
  html: string
  files: File[]
  isEmail: boolean
  senderName: string
}
