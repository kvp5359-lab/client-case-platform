"use client"

/**
 * Тред комментариев: корневой + ответы
 */

import { useState, useCallback } from 'react'
import { Check, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import { useCreateComment, useResolveComment, useUnresolveComment } from '@/hooks/comments'
import { CommentItem } from './CommentItem'
import { CommentInput } from './CommentInput'
import type { CommentThread as CommentThreadType, CommentEntityType } from '@/types/comments'

interface CommentThreadProps {
  thread: CommentThreadType
  entityType: CommentEntityType
  entityId: string
  projectId: string
  workspaceId: string
  canEdit: boolean
  canManage: boolean
}

export function CommentThread({
  thread,
  entityType,
  entityId,
  projectId,
  workspaceId,
  canEdit,
  canManage,
}: CommentThreadProps) {
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [isExpanded, setIsExpanded] = useState(!thread.root.is_resolved)

  const createComment = useCreateComment()
  const resolveComment = useResolveComment(entityType, entityId)
  const unresolveComment = useUnresolveComment(entityType, entityId)

  const handleReply = useCallback(
    (content: string) => {
      createComment.mutate(
        {
          workspace_id: workspaceId,
          project_id: projectId,
          entity_type: entityType,
          entity_id: entityId,
          parent_id: thread.root.id,
          content,
        },
        { onSuccess: () => setShowReplyInput(false) },
      )
    },
    [createComment, workspaceId, projectId, entityType, entityId, thread.root.id],
  )

  const handleResolve = useCallback(() => {
    resolveComment.mutate(thread.root.id)
  }, [resolveComment, thread.root.id])

  const handleUnresolve = useCallback(() => {
    unresolveComment.mutate(thread.root.id)
  }, [unresolveComment, thread.root.id])

  // Свёрнутый resolved тред
  if (thread.root.is_resolved && !isExpanded) {
    return (
      <div className="border-b border-border last:border-b-0">
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
        >
          <ChevronRight className="h-3 w-3 shrink-0" />
          <Check className="h-3 w-3 shrink-0 text-green-500" />
          <span className="truncate">
            {thread.root.author.name}: {thread.root.content}
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="border-b border-border last:border-b-0 px-3 py-1">
      {/* Заголовок resolved-треда (развёрнутый) */}
      {thread.root.is_resolved && (
        <div className="flex items-center justify-between mb-1">
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="flex items-center gap-1 text-[10px] text-green-600"
          >
            <ChevronDown className="h-3 w-3" />
            <Check className="h-3 w-3" />
            Завершено
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleUnresolve}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Возобновить
            </button>
          )}
        </div>
      )}

      {/* Корневой комментарий */}
      <CommentItem
        comment={thread.root}
        entityType={entityType}
        entityId={entityId}
        canEdit={canEdit}
        canManage={canManage}
        isRoot
        onReply={() => setShowReplyInput(true)}
        onResolve={handleResolve}
      />

      {/* Ответы */}
      {thread.replies.length > 0 && (
        <div className="pl-4 border-l-2 border-muted ml-1">
          {thread.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} entityType={entityType} entityId={entityId} canEdit={canEdit} canManage={canManage} />
          ))}
        </div>
      )}

      {/* Поле ответа */}
      {showReplyInput && (
        <div className="pl-4 ml-1 mt-1">
          <CommentInput
            onSubmit={handleReply}
            onCancel={() => setShowReplyInput(false)}
            placeholder="Ответить..."
            isLoading={createComment.isPending}
            autoFocus
          />
        </div>
      )}
    </div>
  )
}
