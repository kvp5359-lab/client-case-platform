/**
 * Типы для useKnowledgeBasePage. Вынесены, чтобы useKnowledgeGroups
 * и useKnowledgeTags могли импортировать их без циклической зависимости.
 */

export interface KnowledgeGroup {
  id: string
  name: string
  color: string | null
  workspace_id: string
  parent_id: string | null
  sort_order: number
  created_at: string
}

export interface KnowledgeTag {
  id: string
  workspace_id: string
  name: string
  color: string
  sort_order: number
  created_at: string
}

export interface ArticleGroupJoin {
  group_id: string
  sort_order: number
  knowledge_groups: { id: string; name: string; color: string | null } | null
}

export interface ArticleTagJoin {
  tag_id: string
  knowledge_tags: { id: string; name: string; color: string } | null
}

export interface KnowledgeArticleStatus {
  id: string
  name: string
  color: string
}

export interface KnowledgeArticle {
  id: string
  workspace_id: string
  title: string
  content: string | null
  access_mode: 'read_only' | 'read_copy'
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
