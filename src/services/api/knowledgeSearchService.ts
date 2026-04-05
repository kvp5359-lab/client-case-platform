/**
 * Сервис для AI-поиска по базе знаний (RAG)
 * Re-export из декомпозированных модулей
 */

import { supabase } from '@/lib/supabase'
import { KnowledgeBaseError } from '../errors'
import type { SearchSourcesResult } from './knowledgeSearchService.types'

// =====================================================
// Типы (перенесены в knowledgeSearchService.types.ts —
// чтобы под-сервисы не образовывали цикл через этот файл)
// =====================================================

export type {
  SearchSource,
  ArticleSource,
  SearchSourcesResult,
  ConversationType,
  ConversationSources,
  KnowledgeConversation,
  KnowledgeMessage,
} from './knowledgeSearchService.types'

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
  getMessages as getKnowledgeMessages,
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
