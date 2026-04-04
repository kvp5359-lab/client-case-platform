/**
 * Типы модуля комментариев
 */

/** Типы сущностей, к которым можно оставить комментарий */
export type CommentEntityType =
  | 'document'
  | 'document_folder'
  | 'folder_slot'
  | 'form_field'
  | 'form_section'
  | 'task'

/** Комментарий из БД */
export interface Comment {
  id: string
  workspace_id: string
  project_id: string
  entity_type: CommentEntityType
  entity_id: string
  parent_id: string | null
  content: string
  is_resolved: boolean
  resolved_by: string | null
  resolved_at: string | null
  created_by: string
  updated_at: string
  created_at: string
}

/** Комментарий с информацией об авторе */
export interface CommentWithAuthor extends Comment {
  author: {
    id: string
    name: string
    email: string
  }
}

/** Тред: корневой комментарий + ответы */
export interface CommentThread {
  root: CommentWithAuthor
  replies: CommentWithAuthor[]
}

/** Данные для создания комментария */
export interface CreateCommentInput {
  workspace_id: string
  project_id: string
  entity_type: CommentEntityType
  entity_id: string
  parent_id?: string
  content: string
}

/** Данные для обновления комментария */
export interface UpdateCommentInput {
  content: string
}
