/**
 * Сервис индексации статей и Q&A базы знаний
 */

import { supabase } from '@/lib/supabase'
import { KnowledgeBaseError } from '../errors'

export async function indexArticle(articleId: string, workspaceId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('knowledge-index', {
    body: { article_id: articleId, workspace_id: workspaceId },
  })
  if (error) throw new KnowledgeBaseError('Не удалось запустить индексацию', error)
}

export async function generateArticleSummary(
  articleId: string,
  workspaceId: string,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('knowledge-index', {
    body: { article_id: articleId, workspace_id: workspaceId, generate_summary_only: true },
  })
  if (error) throw new KnowledgeBaseError('Не удалось сгенерировать summary', error)
  return data?.summary || ''
}

export async function reindexAllArticles(workspaceId: string): Promise<{
  reindexed: number
  failed: number
  remaining: number
}> {
  const { data, error } = await supabase.functions.invoke('knowledge-index', {
    body: { workspace_id: workspaceId, reindex_all: true },
  })
  if (error) throw new KnowledgeBaseError('Не удалось запустить переиндексацию', error)
  if (!data?.success && data?.success !== undefined) {
    throw new KnowledgeBaseError(data?.error || 'Переиндексация завершилась с ошибкой')
  }
  return data as { reindexed: number; failed: number; remaining: number }
}
