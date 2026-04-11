/**
 * Сервис для работы с комментариями
 */

import { supabase } from '@/lib/supabase'
import { CommentError } from '../errors'
import { logger } from '@/utils/logger'
import { safeDeleteOrThrow } from '../supabase/queryHelpers'
import type {
  Comment,
  CommentWithAuthor,
  CommentThread,
  CommentEntityType,
  CreateCommentInput,
  UpdateCommentInput,
} from '@/types/comments'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface ParticipantInfo {
  id: string
  user_id: string
  name: string
  email: string
}

/**
 * Маппинг комментариев + участников → CommentWithAuthor[]
 */
function mapCommentsWithAuthors(
  comments: Comment[],
  participants: ParticipantInfo[],
): CommentWithAuthor[] {
  const participantsByUserId = new Map<string, ParticipantInfo>()
  for (const p of participants) {
    participantsByUserId.set(p.user_id, p)
  }

  return comments.map((comment) => {
    const participant = participantsByUserId.get(comment.created_by)
    return {
      ...comment,
      author: participant
        ? { id: participant.id, name: participant.name, email: participant.email }
        : { id: '', name: 'Неизвестный', email: '' },
    }
  })
}

/**
 * Группировка комментариев в треды
 */
function groupIntoThreads(comments: CommentWithAuthor[]): CommentThread[] {
  const roots: CommentWithAuthor[] = []
  const repliesByParentId = new Map<string, CommentWithAuthor[]>()

  for (const comment of comments) {
    if (comment.parent_id === null) {
      roots.push(comment)
    } else {
      const existing = repliesByParentId.get(comment.parent_id) || []
      existing.push(comment)
      repliesByParentId.set(comment.parent_id, existing)
    }
  }

  // Сортировка: корневые по дате создания, ответы внутри треда по дате
  roots.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  return roots.map((root) => {
    const replies = repliesByParentId.get(root.id) || []
    replies.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    return { root, replies }
  })
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Получение комментариев (тредов) по сущности
 */
export async function getCommentsByEntity(
  entityType: CommentEntityType,
  entityId: string,
  workspaceId: string,
): Promise<CommentThread[]> {
  // 1. Загружаем все комментарии (корневые + ответы)
  const { data: comments, error } = await supabase
    .from('comments')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true })

  if (error) {
    logger.error('Ошибка загрузки комментариев:', error)
    throw new CommentError('Не удалось загрузить комментарии', error)
  }

  if (!comments || comments.length === 0) return []

  // 2. Собираем уникальные user_id авторов
  const userIds = [...new Set(comments.map((c) => c.created_by))]

  // Загружаем участников по user_id БЕЗ фильтра is_deleted —
  // удалённые участники всё ещё могут быть авторами комментариев
  const { data: participants, error: pError } = await supabase
    .from('participants')
    .select('id, user_id, name, email')
    .eq('workspace_id', workspaceId)
    .in('user_id', userIds)

  if (pError) {
    logger.error('Ошибка загрузки участников для комментариев:', pError)
  }

  // 4. Маппим и группируем
  const commentsWithAuthors = mapCommentsWithAuthors(
    comments as Comment[],
    (participants ?? []) as ParticipantInfo[],
  )

  return groupIntoThreads(commentsWithAuthors)
}

/**
 * Пакетный подсчёт комментариев для нескольких сущностей
 * Возвращает Map<entity_id, count> (считаются только корневые комментарии = число тредов)
 *
 * B-138: Используем head:true count запросы — сервер считает сам, клиенту приходит только число.
 */
export async function getCommentCounts(
  entityType: CommentEntityType,
  entityIds: string[],
): Promise<Map<string, number>> {
  if (entityIds.length === 0) return new Map()

  const counts = new Map<string, number>()

  // Один запрос, подсчёт на клиенте. head:true не подходит для группировки по entity_id.
  // Минимизируем трафик — select только entity_id.
  // TODO: Рассмотреть серверный RPC для подсчёта — уменьшит трафик при большом количестве комментариев.
  const { data, error } = await supabase
    .from('comments')
    .select('entity_id', { count: 'exact', head: false })
    .eq('entity_type', entityType)
    .in('entity_id', entityIds)
    .is('parent_id', null)
    .eq('is_resolved', false)

  if (error) {
    logger.error('Ошибка подсчёта комментариев:', error)
    return counts
  }

  for (const row of data || []) {
    counts.set(row.entity_id, (counts.get(row.entity_id) || 0) + 1)
  }
  return counts
}

/**
 * Создание комментария
 */
export async function createComment(input: CreateCommentInput, userId: string): Promise<Comment> {
  const { data, error } = await supabase
    .from('comments')
    .insert({
      workspace_id: input.workspace_id,
      project_id: input.project_id,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      parent_id: input.parent_id || null,
      content: input.content,
      created_by: userId,
    })
    .select()
    .single()

  if (error) {
    logger.error('Ошибка создания комментария:', error)
    throw new CommentError('Не удалось создать комментарий', error)
  }

  return data as Comment
}

/**
 * Обновление комментария (только content)
 */
export async function updateComment(
  commentId: string,
  input: UpdateCommentInput,
): Promise<Comment> {
  const { data, error } = await supabase
    .from('comments')
    .update({ content: input.content })
    .eq('id', commentId)
    .select()
    .single()

  if (error) {
    logger.error('Ошибка обновления комментария:', error)
    throw new CommentError('Не удалось обновить комментарий', error)
  }

  return data as Comment
}

/**
 * Удаление комментария (CASCADE удалит ответы)
 */
export async function deleteComment(commentId: string): Promise<void> {
  await safeDeleteOrThrow(
    supabase.from('comments').delete().eq('id', commentId),
    'Не удалось удалить комментарий',
    CommentError,
  )
}

/**
 * Отметка треда как выполненного
 */
export async function resolveComment(commentId: string, userId: string): Promise<Comment> {
  const { data, error } = await supabase
    .from('comments')
    .update({
      is_resolved: true,
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', commentId)
    .is('parent_id', null)
    .select()
    .single()

  if (error) {
    logger.error('Ошибка завершения треда:', error)
    throw new CommentError('Не удалось завершить обсуждение', error)
  }

  return data as Comment
}

/**
 * Снятие отметки выполнения
 */
export async function unresolveComment(commentId: string): Promise<Comment> {
  const { data, error } = await supabase
    .from('comments')
    .update({
      is_resolved: false,
      resolved_by: null,
      resolved_at: null,
    })
    .eq('id', commentId)
    .is('parent_id', null)
    .select()
    .single()

  if (error) {
    logger.error('Ошибка возобновления треда:', error)
    throw new CommentError('Не удалось возобновить обсуждение', error)
  }

  return data as Comment
}
