/**
 * Сервис для работы с базой знаний
 */

import { supabase } from '@/lib/supabase'
import { Tables } from '@/types/database'
import { KnowledgeBaseError } from '../../errors'
import { safeFetchOrThrow, safeDeleteOrThrow } from '../../supabase/queryHelpers'

export type KnowledgeArticle = Tables<'knowledge_articles'>
export type KnowledgeArticleVersion = Tables<'knowledge_article_versions'>
export type KnowledgeGroup = Tables<'knowledge_groups'>
export type KnowledgeArticleGroup = Tables<'knowledge_article_groups'>

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

export async function createArticle(article: {
  workspace_id: string
  title: string
  content?: string
  access_mode?: string
  created_by?: string
}): Promise<KnowledgeArticle> {
  return safeFetchOrThrow(
    supabase.from('knowledge_articles').insert(article).select().single(),
    'Не удалось создать статью',
    KnowledgeBaseError,
  )
}

export async function updateArticle(
  articleId: string,
  updates: Partial<Pick<KnowledgeArticle, 'title' | 'content' | 'access_mode' | 'is_published'>>,
): Promise<KnowledgeArticle> {
  return safeFetchOrThrow(
    supabase.from('knowledge_articles').update(updates).eq('id', articleId).select().single(),
    'Не удалось обновить статью',
    KnowledgeBaseError,
  )
}

export async function deleteArticle(articleId: string): Promise<void> {
  return safeDeleteOrThrow(
    supabase.from('knowledge_articles').delete().eq('id', articleId),
    'Не удалось удалить статью',
    KnowledgeBaseError,
  )
}

// =====================================================
// Версии статей
// =====================================================

interface VersionHistoryRow {
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

// =====================================================
// Группы
// =====================================================

export async function getGroupsByWorkspace(workspaceId: string): Promise<KnowledgeGroup[]> {
  return (
    (await safeFetchOrThrow(
      supabase
        .from('knowledge_groups')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('sort_order', { ascending: true }),
      'Не удалось загрузить группы',
      KnowledgeBaseError,
    )) ?? []
  )
}

export async function createGroup(group: {
  workspace_id: string
  name: string
  sort_order?: number
}): Promise<KnowledgeGroup> {
  return safeFetchOrThrow(
    supabase.from('knowledge_groups').insert(group).select().single(),
    'Не удалось создать группу',
    KnowledgeBaseError,
  )
}

export async function updateGroup(
  groupId: string,
  updates: Partial<Pick<KnowledgeGroup, 'name' | 'sort_order'>>,
): Promise<KnowledgeGroup> {
  return safeFetchOrThrow(
    supabase.from('knowledge_groups').update(updates).eq('id', groupId).select().single(),
    'Не удалось обновить группу',
    KnowledgeBaseError,
  )
}

export async function deleteGroup(groupId: string): Promise<void> {
  return safeDeleteOrThrow(
    supabase.from('knowledge_groups').delete().eq('id', groupId),
    'Не удалось удалить группу',
    KnowledgeBaseError,
  )
}

// =====================================================
// Связь статья <-> группа
// =====================================================

export async function setArticleGroups(articleId: string, groupIds: string[]): Promise<void> {
  // B-110: atomic update via RPC (delete+insert in single transaction)
  const { error } = await supabase.rpc('update_article_groups', {
    p_article_id: articleId,
    p_group_ids: groupIds,
  })
  if (error) {
    throw new KnowledgeBaseError('Не удалось обновить группы статьи', error)
  }
}

// =====================================================
// Статьи для проекта (через шаблон)
// =====================================================

export interface ArticleWithGroups extends KnowledgeArticle {
  knowledge_article_groups: Array<{
    group_id: string
    knowledge_groups: KnowledgeGroup
  }>
}

export async function getArticlesForProject(
  projectTemplateId: string,
): Promise<ArticleWithGroups[]> {
  // 1+2. Точечные привязки статей и групповые привязки — параллельно
  const [articleLinks, groupLinks] = await Promise.all([
    safeFetchOrThrow(
      supabase
        .from('knowledge_article_templates')
        .select('article_id')
        .eq('project_template_id', projectTemplateId),
      'Не удалось загрузить статьи проекта',
      KnowledgeBaseError,
    ),
    safeFetchOrThrow(
      supabase
        .from('knowledge_group_templates')
        .select('group_id')
        .eq('project_template_id', projectTemplateId),
      'Не удалось загрузить группы проекта',
      KnowledgeBaseError,
    ),
  ])

  const allArticleIds = new Set(
    (articleLinks || []).map((l: { article_id: string }) => l.article_id),
  )
  const linkedGroupIds = (groupLinks || []).map((l: { group_id: string }) => l.group_id)

  // 3. Статьи из привязанных групп
  if (linkedGroupIds.length > 0) {
    const groupArticles = await safeFetchOrThrow(
      supabase.from('knowledge_article_groups').select('article_id').in('group_id', linkedGroupIds),
      'Не удалось загрузить статьи групп',
      KnowledgeBaseError,
    )
    for (const ga of groupArticles || []) {
      allArticleIds.add(ga.article_id)
    }
  }

  const articleIds = [...allArticleIds]
  if (articleIds.length === 0) return []

  return (
    (await safeFetchOrThrow(
      supabase
        .from('knowledge_articles')
        .select(
          `
          *,
          knowledge_article_groups(
            group_id,
            knowledge_groups(*)
          )
        `,
        )
        .in('id', articleIds)
        .eq('is_published', true),
      'Не удалось загрузить статьи проекта',
      KnowledgeBaseError,
    )) ?? []
  )
}
