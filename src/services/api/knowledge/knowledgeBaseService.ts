/**
 * Сервис для работы с базой знаний
 */

import { supabase } from '@/lib/supabase'
import { Tables } from '@/types/database'
import { KnowledgeBaseError } from '../../errors'
import { safeFetchOrThrow } from '../../supabase/queryHelpers'

export type KnowledgeArticle = Tables<'knowledge_articles'>
export type KnowledgeArticleVersion = Tables<'knowledge_article_versions'>

// =====================================================
// Статьи
// =====================================================

export async function getArticlesByWorkspace(workspaceId: string): Promise<KnowledgeArticle[]> {
  return (
    (await safeFetchOrThrow(
      supabase
        .from('knowledge_articles')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('title', { ascending: true }),
      'Не удалось загрузить статьи базы знаний',
      KnowledgeBaseError,
    )) ?? []
  )
}

export async function getArticleById(articleId: string): Promise<KnowledgeArticle> {
  return safeFetchOrThrow(
    supabase.from('knowledge_articles').select('*').eq('id', articleId).single(),
    'Не удалось загрузить статью',
    KnowledgeBaseError,
  )
}

// =====================================================
// Версии статей
// =====================================================

type VersionHistoryRow = {
  id: string
  version: number
  title: string
  comment: string | null
  created_by: string | null
  created_at: string
  is_current: boolean
}

export async function getArticleVersionHistory(articleId: string): Promise<VersionHistoryRow[]> {
  const { data, error } = await supabase.rpc('get_article_version_history', {
    p_article_id: articleId,
  })
  if (error) throw new KnowledgeBaseError('Не удалось загрузить историю версий', error)
  return (data as VersionHistoryRow[]) ?? []
}

export async function getArticleVersion(versionId: string): Promise<KnowledgeArticleVersion> {
  return safeFetchOrThrow(
    supabase.from('knowledge_article_versions').select('*').eq('id', versionId).single(),
    'Не удалось загрузить версию',
    KnowledgeBaseError,
  )
}

export async function createArticleVersion(articleId: string, comment?: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_article_version', {
    p_article_id: articleId,
    p_comment: comment ?? undefined,
  })
  if (error) throw new KnowledgeBaseError('Не удалось создать версию', error)
  return data as string
}

export async function restoreArticleVersion(versionId: string): Promise<string> {
  const { data, error } = await supabase.rpc('restore_article_version', {
    p_version_id: versionId,
  })
  if (error) throw new KnowledgeBaseError('Не удалось восстановить версию', error)
  return data as string
}
