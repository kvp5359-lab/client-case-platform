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

export interface ConversationSources {
  /** Где искать переписку (треды проекта). */
  chats: ChatScope
  formData: boolean
  documents: boolean
  knowledge: 'project' | 'all' | null
  /** @deprecated старый формат — оставлено для совместимости при чтении из БД */
  clientMessages?: boolean
  /** @deprecated старый формат — оставлено для совместимости при чтении из БД */
  teamMessages?: boolean
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
      knowledge: null,
    }
  }

  // Новый формат уже содержит chats
  if (raw.chats && typeof raw.chats === 'object' && 'mode' in raw.chats) {
    return {
      chats: raw.chats,
      formData: !!raw.formData,
      documents: !!raw.documents,
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
