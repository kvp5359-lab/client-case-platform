/**
 * Сервис для AI-поиска по базе знаний (RAG)
 * Re-export из декомпозированных модулей
 */

import { supabase } from '@/lib/supabase'
import { KnowledgeBaseError } from '../errors'

// =====================================================
// Типы
// =====================================================

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

// =====================================================
// Поиск
// =====================================================

export async function searchKnowledgeSources(params: {
  question: string
  workspace_id: string
  template_id?: string
}): Promise<SearchSourcesResult> {
  const { data, error } = await supabase.functions.invoke('knowledge-search', {
    body: { ...params, search_only: true },
  })
  if (error) throw new KnowledgeBaseError('Не удалось выполнить поиск', error)
  if (!data?.success) throw new KnowledgeBaseError(data?.error || 'Ошибка поиска')
  return data as SearchSourcesResult
}

// =====================================================
// Re-exports
// =====================================================

// Indexing
export {
  indexArticle,
  generateArticleSummary,
  reindexAllArticles,
} from './knowledgeIndexingService'

// Streaming
export { streamKnowledgeSearch } from './knowledgeStreamService'
export type { StreamCallbacks } from './knowledgeStreamService'

// Conversations & Messages
export {
  getConversations,
  createConversation,
  updateConversation,
  deleteConversation,
  getMessages,
  addMessage,
} from './knowledgeConversationService'

// Q&A
export {
  getQAItems,
  createQA,
  updateQA,
  deleteQA,
  indexQA,
  bulkCreateQA,
  setQATags,
  setQAGroups,
} from './knowledgeQAService'
export type { KnowledgeQA } from './knowledgeQAService'
