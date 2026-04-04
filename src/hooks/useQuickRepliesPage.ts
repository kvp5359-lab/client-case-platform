"use client"

/**
 * useQuickRepliesPage — координатор страницы «Быстрые ответы».
 * По паттерну useKnowledgeBasePage.
 */

import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { quickReplyKeys } from '@/hooks/queryKeys'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { useQuickReplyGroups } from './useQuickReplyGroups'
import {
  useQuickReplies,
  useCreateQuickReply,
  useUpdateQuickReply,
  useDeleteQuickReply,
  useReorderQuickReplies,
  type QuickReply,
} from './useQuickReplies'

export function useQuickRepliesPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const queryClient = useQueryClient()

  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // Editing quick reply (dialog)
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null)
  const [replyDialogOpen, setReplyDialogOpen] = useState(false)

  // Sub-hooks
  const groupsHook = useQuickReplyGroups(workspaceId)
  const { data: replies = [], isLoading: repliesLoading } = useQuickReplies(workspaceId)
  const createReplyMutation = useCreateQuickReply(workspaceId)
  const updateReplyMutation = useUpdateQuickReply(workspaceId)
  const deleteReplyMutation = useDeleteQuickReply(workspaceId)
  const reorderRepliesMutation = useReorderQuickReplies(workspaceId)

  // Filtering
  const filteredReplies = replies.filter((r) => {
    if (!searchQuery) return true
    return r.name.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const getRepliesForGroup = (groupId: string) =>
    filteredReplies
      .filter((r) => r.group_id === groupId)
      .sort((a, b) => a.order_index - b.order_index)

  const ungroupedReplies = filteredReplies
    .filter((r) => !r.group_id)
    .sort((a, b) => a.order_index - b.order_index)

  // Handlers
  const handleCreateReply = (groupId?: string) => {
    createReplyMutation.mutate({ name: 'Новый шаблон', groupId })
  }

  const handleDeleteReply = async (replyId: string, replyName: string) => {
    const ok = await confirm({
      title: 'Удалить шаблон?',
      description: `Шаблон "${replyName}" будет удалён. Это действие нельзя отменить.`,
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return
    deleteReplyMutation.mutate(replyId)
  }

  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    const ok = await confirm({
      title: 'Удалить группу?',
      description: `Группа "${groupName}" будет удалена. Шаблоны из неё станут «без группы».`,
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return
    groupsHook.deleteGroupMutation.mutate(groupId)
  }

  const openEditReply = (reply: QuickReply) => {
    setEditingReply(reply)
    setReplyDialogOpen(true)
  }

  const openCreateReplyDialog = (groupId?: string | null) => {
    // Создаём шаблон сразу в БД (как в Knowledge Base), а не через диалог
    createReplyMutation.mutate({ name: 'Новый шаблон', groupId: groupId ?? undefined })
  }

  return {
    workspaceId,
    // Search
    searchQuery,
    setSearchQuery,
    // Replies
    replies,
    repliesLoading,
    filteredReplies,
    getRepliesForGroup,
    ungroupedReplies,
    createReplyMutation,
    updateReplyMutation,
    deleteReplyMutation,
    reorderRepliesMutation,
    handleCreateReply,
    handleDeleteReply,
    // Edit dialog
    editingReply,
    setEditingReply,
    replyDialogOpen,
    setReplyDialogOpen,
    openEditReply,
    openCreateReplyDialog,
    // Groups (from sub-hook)
    ...groupsHook,
    handleDeleteGroup,
    // Confirm dialog
    confirmDialogProps: { state: confirmState, onConfirm: handleConfirm, onCancel: handleCancel },
  }
}
