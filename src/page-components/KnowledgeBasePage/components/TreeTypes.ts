/**
 * Общие типы для дерева статей базы знаний.
 * Вынесены, чтобы разорвать цикл между ArticleStatusIndicators,
 * GroupTreeItem и ArticleRows.
 */

export interface TreeArticle {
  id: string
  title: string
  content?: string | null
  access_mode?: string
  status_id?: string | null
  statuses?: { id: string; name: string; color: string } | null
  knowledge_article_groups: { group_id: string; sort_order: number }[]
  knowledge_article_tags?: {
    tag_id: string
    knowledge_tags: { id: string; name: string; color: string } | null
  }[]
}

export interface TreeGroup {
  id: string
  name: string
  parent_id: string | null
  sort_order?: number
  color?: string | null
}
