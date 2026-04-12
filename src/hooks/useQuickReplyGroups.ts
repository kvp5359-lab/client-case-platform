"use client"

/**
 * useQuickReplyGroups — CRUD-операции и состояние для групп быстрых ответов.
 * По паттерну useKnowledgeGroups.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { quickReplyKeys } from '@/hooks/queryKeys'
import { supabase } from '@/lib/supabase'
import { safeFetchOrThrow, safeInsertVoidOrThrow, safeUpdateVoidOrThrow, safeDeleteOrThrow } from '@/services/supabase/queryHelpers'
import type { Database } from '@/types/database'

export type QuickReplyGroup = Database['public']['Tables']['quick_reply_groups']['Row']

export function useQuickReplyGroups(workspaceId: string | undefined) {
  const queryClient = useQueryClient()

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')
  const [addingGroupParentId, setAddingGroupParentId] = useState<string | 'root' | null>(null)
  const [newGroupName, setNewGroupName] = useState('')

  const groupsQuery = useQuery({
    queryKey: quickReplyKeys.groups(workspaceId!),
    queryFn: () =>
      safeFetchOrThrow<QuickReplyGroup[]>(
        supabase.from('quick_reply_groups').select('*').eq('workspace_id', workspaceId!).order('order_index').order('name'),
        'Не удалось загрузить группы быстрых ответов',
      ),
    enabled: !!workspaceId,
  })

  const createGroupMutation = useMutation({
    mutationFn: async ({ name, parentId }: { name: string; parentId?: string | null }) => {
      await safeInsertVoidOrThrow(
        supabase.from('quick_reply_groups').insert({
          workspace_id: workspaceId!,
          name,
          parent_id: parentId || null,
        }),
        'Не удалось создать группу',
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quickReplyKeys.groups(workspaceId!) })
      setNewGroupName('')
      setAddingGroupParentId(null)
      toast.success('Группа создана')
    },
    onError: () => {
      toast.error('Не удалось создать группу')
    },
  })

  const updateGroupMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await safeUpdateVoidOrThrow(
        supabase.from('quick_reply_groups').update({ name }).eq('id', id),
        'Не удалось обновить группу',
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quickReplyKeys.groups(workspaceId!) })
      setEditingGroupId(null)
      setEditingGroupName('')
    },
    onError: () => {
      toast.error('Не удалось обновить группу')
    },
  })

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      await safeDeleteOrThrow(
        supabase.from('quick_reply_groups').delete().eq('id', groupId),
        'Не удалось удалить группу',
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: quickReplyKeys.groups(workspaceId!) })
      queryClient.invalidateQueries({ queryKey: quickReplyKeys.list(workspaceId!) })
      toast.success('Группа удалена')
    },
    onError: () => {
      toast.error('Не удалось удалить группу')
    },
  })

  const handleCreateGroup = () => {
    const name = newGroupName.trim()
    if (!name) return
    const parentId = addingGroupParentId === 'root' ? null : addingGroupParentId
    createGroupMutation.mutate({ name, parentId })
  }

  const handleSaveGroupEdit = () => {
    const name = editingGroupName.trim()
    if (!name || !editingGroupId) return
    updateGroupMutation.mutate({ id: editingGroupId, name })
  }

  return {
    groups: groupsQuery.data || [],
    groupsQuery,
    editingGroupId,
    setEditingGroupId,
    editingGroupName,
    setEditingGroupName,
    addingGroupParentId,
    setAddingGroupParentId,
    newGroupName,
    setNewGroupName,
    createGroupMutation,
    updateGroupMutation,
    deleteGroupMutation,
    handleCreateGroup,
    handleSaveGroupEdit,
  }
}
