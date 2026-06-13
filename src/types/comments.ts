/**
 * Типы модуля комментариев
 */

import type { Tables } from './database'

/** Типы сущностей, к которым можно оставить комментарий */
export type CommentEntityType =
  | 'document'
  | 'document_folder'
  | 'folder_slot'
  | 'form_field'
  | 'form_section'
  | 'task'

/**
 * Комментарий из БД. Привязан к сгенерированному Row, чтобы не отставать при
 * изменении схемы; единственное отличие — `entity_type` сужен до union
 * (в БД колонка `string`) — осознанный type-tightening.
 */
export type Comment = Omit<Tables<'comments'>, 'entity_type'> & {
  entity_type: CommentEntityType
}

/** Комментарий с информацией об авторе */
export type CommentWithAuthor = {
  author: {
    id: string
    name: string
    email: string
  }
} & Comment

/** Тред: корневой комментарий + ответы */
export type CommentThread = {
  root: CommentWithAuthor
  replies: CommentWithAuthor[]
}

/** Данные для создания комментария */
export type CreateCommentInput = {
  workspace_id: string
  project_id: string
  entity_type: CommentEntityType
  entity_id: string
  parent_id?: string
  content: string
}

/** Данные для обновления комментария */
export type UpdateCommentInput = {
  content: string
}
