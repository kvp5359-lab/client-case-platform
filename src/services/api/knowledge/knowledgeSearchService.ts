/**
 * Сервис для AI-поиска по базе знаний (RAG)
 * Re-export из декомпозированных модулей
 */

// =====================================================
// Типы (перенесены в knowledgeSearchService.types.ts —
// чтобы под-сервисы не образовывали цикл через этот файл)
// =====================================================

export type {
  SearchSource,
  ArticleSource,
  SearchSourcesResult,
  ConversationType,
  ChatScope,
  ConversationSources,
  KnowledgeConversation,
  KnowledgeMessage,
} from './knowledgeSearchService.types'

export { migrateLegacySources } from './knowledgeSearchService.types'

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
