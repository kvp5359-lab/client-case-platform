"use client"

/**
 * Содержимое попапа комментариев
 */

import { Loader2 } from 'lucide-react'
import { useComments, useCreateComment } from '@/hooks/comments'
import { useProjectPermissions } from '@/hooks/permissions/useProjectPermissions'
import { CommentThread } from './CommentThread'
import { CommentInput } from './CommentInput'
import type { CommentEntityType } from '@/types/comments'

interface CommentsPopoverProps {
  entityType: CommentEntityType
  entityId: string
  projectId: string
  workspaceId: string
}

export function CommentsPopover({
  entityType,
  entityId,
  projectId,
  workspaceId,
}: CommentsPopoverProps) {
  const { data: threads, isLoading } = useComments(entityType, entityId, workspaceId)
  const { can } = useProjectPermissions({ projectId })
  const createComment = useCreateComment()

  const canEdit = can('comments', 'edit_comments')
  const canManage = can('comments', 'manage_comments')

  const handleCreateRoot = (content: string) => {
    createComment.mutate({
      workspace_id: workspaceId,
      project_id: projectId,
      entity_type: entityType,
      entity_id: entityId,
      content,
    })
  }

  return (
    <div className="flex flex-col max-h-[400px]">
      {/* Заголовок */}
      <div className="px-3 py-2 border-b border-border">
        <h4 className="text-sm font-medium">Комментарии</h4>
      </div>

      {/* Список тредов */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !threads || threads.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            Нет комментариев
          </div>
        ) : (
          threads.map((thread) => (
            <CommentThread
              key={thread.root.id}
              thread={thread}
              entityType={entityType}
              entityId={entityId}
              projectId={projectId}
              workspaceId={workspaceId}
              canEdit={canEdit}
              canManage={canManage}
            />
          ))
        )}
      </div>

      {/* Поле ввода нового комментария */}
      {canEdit && (
        <div className="px-3 py-2 border-t border-border">
          <CommentInput
            onSubmit={handleCreateRoot}
            placeholder="Новый комментарий..."
            isLoading={createComment.isPending}
          />
        </div>
      )}
    </div>
  )
}
