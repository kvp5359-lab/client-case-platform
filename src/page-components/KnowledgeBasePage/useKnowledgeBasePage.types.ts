/**
 * Типы для useKnowledgeBasePage. Вынесены, чтобы useKnowledgeGroups
 * и useKnowledgeTags могли импортировать их без циклической зависимости.
 */

export type TemplateAccessMode = 'inherit' | 'everywhere' | 'selected' | 'nowhere'

export type KnowledgeGroup = {
  id: string
  name: string
  color: string | null
  workspace_id: string
  parent_id: string | null
  sort_order: number
  created_at: string
  template_access_mode: TemplateAccessMode
}

export type KnowledgeTag = {
  id: string
  workspace_id: string
  name: string
  color: string
  sort_order: number
  created_at: string
}

export type ArticleGroupJoin = {
  group_id: string
  sort_order: number
  knowledge_groups: { id: string; name: string; color: string | null } | null
}

export type ArticleTagJoin = {
  tag_id: string
  knowledge_tags: { id: string; name: string; color: string } | null
}

export type KnowledgeArticleStatus = {
  id: string
  name: string
  color: string
}

export type KnowledgeArticle = {
  id: string
  workspace_id: string
  title: string
  content: string | null
  access_mode: 'read_only' | 'read_copy'
  template_access_mode: TemplateAccessMode
  is_published: boolean
  status_id: string | null
  statuses: KnowledgeArticleStatus | null
  created_by: string | null
  author_email: string | null
  author_name: string | null
  created_at: string
  updated_at: string
  indexing_status: string | null
  indexed_at: string | null
  knowledge_article_groups: ArticleGroupJoin[]
  knowledge_article_tags: ArticleTagJoin[]
}
