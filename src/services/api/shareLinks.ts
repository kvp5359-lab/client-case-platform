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

/**
 * Узел дерева документов проекта (вкладка «Описания документов»).
 * Папки и слоты приходят ВСЕ, включая те, к которым не привязана статья:
 * article_id/token у них null — такой узел вставляется в сообщение просто
 * названием, без ссылки.
 */
export type ShareableDocSlot = {
  slot_id: string
  name: string
  article_id: string | null
  /** Активный токен статьи, если ссылка уже создавалась; иначе null. */
  token: string | null
  /** Документ загружен в слот (и не в корзине) — см. режим uploadedDisplay. */
  has_document: boolean
}

export type ShareableDocFolder = {
  folder_id: string
  name: string
  article_id: string | null
  token: string | null
  slots: ShareableDocSlot[]
}

export type ShareableDocKit = {
  kit_id: string
  name: string
  folders: ShareableDocFolder[]
}

export type ProjectShareables = {
  articles: ShareableArticle[]
  external: ShareableExternal[]
  /** Дерево вкладки «Документы»: набор → папки → слоты. */
  doc_tree: ShareableDocKit[]
}

export async function getProjectShareableResources(projectId: string): Promise<ProjectShareables> {
  const { data, error } = await supabase.rpc('get_project_shareable_resources', {
    p_project_id: projectId,
  })
  if (error) throw error
  const obj = (data ?? {}) as {
    articles?: ShareableArticle[]
    external?: ShareableExternal[]
    doc_tree?: ShareableDocKit[]
  }
  return {
    articles: obj.articles ?? [],
    external: obj.external ?? [],
    doc_tree: obj.doc_tree ?? [],
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
