/**
 * Типы для useArticleEditor, вынесены, чтобы useArticleEditorMutations
 * мог импортировать их без цикла.
 */

export interface EditorKnowledgeArticle {
  id: string
  workspace_id: string
  title: string
  content: string | null
  summary: string | null
  access_mode: 'read_only' | 'read_copy'
  is_published: boolean
  status_id: string | null
  statuses: { id: string; name: string; color: string } | null
  created_at: string
  updated_at: string
  indexing_status: string | null
  indexed_at: string | null
}

export interface EditorKnowledgeGroup {
  id: string
  name: string
  color: string | null
  workspace_id: string
  parent_id: string | null
  sort_order: number
}

export interface EditorKnowledgeTag {
  id: string
  name: string
  color: string
}
