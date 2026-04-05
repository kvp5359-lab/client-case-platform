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

export interface ConversationSources {
  clientMessages: boolean
  teamMessages: boolean
  formData: boolean
  documents: boolean
  knowledge: 'project' | 'all' | null
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
