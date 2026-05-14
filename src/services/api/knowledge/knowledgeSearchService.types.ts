/**
 * Типы для knowledgeSearchService. Вынесены, чтобы
 * knowledgeConversationService/knowledgeStreamService могли импортировать
 * их без циклической зависимости через knowledgeSearchService.
 */

export interface SearchSource {
  article_id: string | null
  qa_id?: string | null
  article_title: string
  chunk_text?: string
  chunks?: string[]
  similarity: number
  source_type?: 'article' | 'qa'
}

export interface ArticleSource {
  article_id: string | null
  qa_id?: string | null
  article_title: string
  similarity: number
  chunk_count: number
  source_type?: 'article' | 'qa'
}

export interface SearchSourcesResult {
  sources: ArticleSource[]
  total_chunks: number
}

export type ConversationType = 'knowledge' | 'project'

/**
 * Скоуп поиска по чатам/задачам проекта.
 * - mode 'all'      — искать во всех тредах проекта
 * - mode 'selected' — искать только в перечисленных threadIds (пустой массив = «никаких чатов»)
 */
export interface ChatScope {
  mode: 'all' | 'selected'
  threadIds: string[]
}

/**
 * Скоуп выбора для модуля «Контекст проекта».
 * mode 'all' → все записи модуля (отключение тогла = `mode: 'selected', itemIds: []`).
 * mode 'selected' → только перечисленные id.
 */
export interface ProjectContextScope {
  mode: 'all' | 'selected'
  itemIds: string[]
}

export interface ConversationSources {
  /** Где искать переписку (треды проекта). */
  chats: ChatScope
  formData: boolean
  documents: boolean
  /** Внутренние материалы команды (модуль project_context). */
  projectContext: ProjectContextScope
  knowledge: 'project' | 'all' | null
  /** @deprecated старый формат — оставлено для совместимости при чтении из БД */
  clientMessages?: boolean
  /** @deprecated старый формат — оставлено для совместимости при чтении из БД */
  teamMessages?: boolean
}

const DEFAULT_PROJECT_CONTEXT_SCOPE: ProjectContextScope = {
  mode: 'selected',
  itemIds: [],
}

/**
 * Нормализует поле projectContext из БД (может быть boolean — старый формат,
 * либо ProjectContextScope — новый).
 */
function normalizeProjectContext(
  raw: Partial<ConversationSources>['projectContext'] | boolean | undefined,
): ProjectContextScope {
  if (!raw) return { ...DEFAULT_PROJECT_CONTEXT_SCOPE }
  if (typeof raw === 'boolean') {
    return raw ? { mode: 'all', itemIds: [] } : { ...DEFAULT_PROJECT_CONTEXT_SCOPE }
  }
  if (typeof raw === 'object' && 'mode' in raw) {
    return {
      mode: raw.mode === 'all' ? 'all' : 'selected',
      itemIds: Array.isArray(raw.itemIds) ? raw.itemIds : [],
    }
  }
  return { ...DEFAULT_PROJECT_CONTEXT_SCOPE }
}

/**
 * Конвертирует старый формат `sources` (clientMessages/teamMessages) в новый (chats).
 * Если уже новый формат — возвращает как есть. Безопасно вызывать на null.
 */
export function migrateLegacySources(
  raw: Partial<ConversationSources> | null | undefined,
): ConversationSources {
  if (!raw) {
    return {
      chats: { mode: 'all', threadIds: [] },
      formData: false,
      documents: false,
      projectContext: { ...DEFAULT_PROJECT_CONTEXT_SCOPE },
      knowledge: null,
    }
  }

  // Новый формат уже содержит chats
  if (raw.chats && typeof raw.chats === 'object' && 'mode' in raw.chats) {
    return {
      chats: raw.chats,
      formData: !!raw.formData,
      documents: !!raw.documents,
      projectContext: normalizeProjectContext(
        raw.projectContext as Partial<ConversationSources>['projectContext'] | boolean | undefined,
      ),
      knowledge: raw.knowledge ?? null,
    }
  }

  // Старый формат: clientMessages/teamMessages → chats.mode = 'all' если хоть один true,
  // иначе 'selected' с пустым массивом (пользователь явно отключал чаты).
  const hadAnyChats = !!raw.clientMessages || !!raw.teamMessages
  return {
    chats: hadAnyChats
      ? { mode: 'all', threadIds: [] }
      : { mode: 'selected', threadIds: [] },
    formData: !!raw.formData,
    documents: !!raw.documents,
    projectContext: normalizeProjectContext(
      raw.projectContext as Partial<ConversationSources>['projectContext'] | boolean | undefined,
    ),
    knowledge: raw.knowledge ?? null,
  }
}

export interface KnowledgeConversation {
  id: string
  workspace_id: string
  project_id: string | null
  user_id: string
  title: string | null
  type: ConversationType
  sources: ConversationSources | null
  created_at: string
  updated_at: string
}

export interface KnowledgeMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  sources: SearchSource[] | null
  created_at: string
}
