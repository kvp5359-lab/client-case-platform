/**
 * Сервис шеринг-ссылок для клиента.
 * - getProjectShareableResources — собрать статьи + внешние ссылки проекта.
 * - ensureArticleShareLink / regenerateArticleShareLink — получить/пересоздать
 *   публичную ссылку на статью в контексте проекта.
 *
 * Публичный резолвер get_shared_article вызывается на самой публичной странице
 * (src/app/a/[token]/page.tsx), здесь его нет.
 */

import { supabase } from '@/lib/supabase'

export type ShareableArticle = {
  article_id: string
  title: string
  /** Активный токен, если ссылка уже создавалась; иначе null. */
  token: string | null
  /** Группа базы знаний, к которой относится статья (или null — «Без группы»). */
  group_name: string | null
}

export type ShareableExternal = {
  kind: 'drive_folder' | 'form' | 'brief' | 'kit_folder' | 'doc_folder' | 'source_doc' | string
  label: string
  url: string
  /** Для kit_folder/doc_folder — id набора документов (иерархия подпапок). */
  kit_id?: string | null
}

export type ProjectShareables = {
  articles: ShareableArticle[]
  external: ShareableExternal[]
}

export async function getProjectShareableResources(projectId: string): Promise<ProjectShareables> {
  const { data, error } = await supabase.rpc('get_project_shareable_resources', {
    p_project_id: projectId,
  })
  if (error) throw error
  const obj = (data ?? {}) as { articles?: ShareableArticle[]; external?: ShareableExternal[] }
  return {
    articles: obj.articles ?? [],
    external: obj.external ?? [],
  }
}

export async function ensureArticleShareLink(articleId: string, projectId: string): Promise<string> {
  const { data, error } = await supabase.rpc('ensure_article_share_link', {
    p_article_id: articleId,
    p_project_id: projectId,
  })
  if (error) throw error
  return data as string
}

export async function regenerateArticleShareLink(
  articleId: string,
  projectId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('regenerate_article_share_link', {
    p_article_id: articleId,
    p_project_id: projectId,
  })
  if (error) throw error
  return data as string
}

/** Построить полный публичный URL по токену на текущем host'е воркспейса. */
export function buildShareUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/a/${token}`
}
