"use client"

/**
 * Один комментарий
 */

import { useState, useCallback } from 'react'
import { Check, Pencil, Trash2, Reply } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useAuth } from '@/contexts/AuthContext'
import { useUpdateComment, useDeleteComment } from '@/hooks/comments'
import { CommentInput } from './CommentInput'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { CommentWithAuthor } from '@/types/comments'

interface CommentItemProps {
  comment: CommentWithAuthor
  canEdit: boolean
  canManage: boolean
  isRoot?: boolean
  onReply?: () => void
  onResolve?: () => void
}

export function CommentItem({
  comment,
  canEdit,
  canManage,
  isRoot = false,
  onReply,
  onResolve,
}: CommentItemProps) {
  const { user } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const updateComment = useUpdateComment()
  const deleteComment = useDeleteComment()

  const isOwn = user?.id === comment.created_by

  const handleUpdate = useCallback(
    (content: string) => {
      updateComment.mutate(
        { commentId: comment.id, input: { content } },
        { onSuccess: () => setIsEditing(false) },
      )
    },
    [comment.id, updateComment],
  )

  const handleDelete = useCallback(() => {
    deleteComment.mutate(comment.id, {
      onSuccess: () => setShowDeleteConfirm(false),
    })
  }, [comment.id, deleteComment])

  const timeAgo = formatDistanceToNow(new Date(comment.created_at), {
    addSuffix: true,
    locale: ru,
  })

  const canEditThis = canEdit && isOwn
  const canDeleteThis = (canEdit && isOwn) || canManage

  if (isEditing) {
    return (
      <div className="py-1">
        <CommentInput
          onSubmit={handleUpdate}
          onCancel={() => setIsEditing(false)}
          initialValue={comment.content}
          placeholder="Редактировать..."
          isLoading={updateComment.isPending}
          autoFocus
        />
      </div>
    )
  }

  return (
    <div className="group/comment py-1.5">
      {/* Заголовок: автор + время + кнопки действий */}
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-xs font-medium text-foreground">{comment.author.name}</span>
        <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
        {comment.updated_at !== comment.created_at && (
          <span className="text-[10px] text-muted-foreground italic">ред.</span>
        )}
        <div className="flex items-center gap-1 ml-auto opacity-0 group-hover/comment:opacity-100 transition-opacity">
          {isRoot && onResolve && canEdit && !comment.is_resolved && (
            <button
              type="button"
              onClick={onResolve}
              className="inline-flex items-center justify-center h-4 w-4 rounded-full border border-muted-foreground/40 text-muted-foreground/40 hover:border-green-500 hover:text-green-600 hover:bg-green-50 transition-colors"
              title="Завершить"
            >
              <Check className="h-2.5 w-2.5" />
            </button>
          )}
          {canEditThis && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          {canDeleteThis && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center text-[10px] text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Текст + кнопка Ответить инлайн после текста */}
      <p className="text-sm text-foreground whitespace-pre-wrap break-words">
        {comment.content}
        {isRoot && onReply && canEdit && (
          <>
            {'  '}
            <button
              type="button"
              onClick={onReply}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors align-baseline opacity-0 group-hover/comment:opacity-100"
            >
              <Reply className="h-3 w-3" />
              Ответить
            </button>
          </>
        )}
      </p>

      {/* Диалог подтверждения удаления */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить комментарий?</AlertDialogTitle>
            <AlertDialogDescription>
              {isRoot
                ? 'Комментарий и все ответы на него будут удалены. Это действие нельзя отменить.'
                : 'Комментарий будет удалён. Это действие нельзя отменить.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteComment.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteComment.isPending ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
