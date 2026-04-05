/**
 * useKnowledgeGroups — CRUD-операции и состояние для групп базы знаний.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { knowledgeBaseKeys } from '@/hooks/queryKeys'
import { supabase } from '@/lib/supabase'
import type { KnowledgeGroup } from './useKnowledgeBasePage.types'

export function useKnowledgeGroups(workspaceId: string | undefined) {
  const queryClient = useQueryClient()

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')
  const [addingGroupParentId, setAddingGroupParentId] = useState<string | 'root' | null>(null)
  const [newGroupName, setNewGroupName] = useState('')

  const groupsQuery = useQuery({
    queryKey: knowledgeBaseKeys.groups(workspaceId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_groups')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return (data || []) as KnowledgeGroup[]
    },
    enabled: !!workspaceId,
  })

  const createGroupMutation = useMutation({
    mutationFn: async ({
      name,
      parentId,
      color,
    }: {
      name: string
      parentId?: string | null
      color?: string
    }) => {
      const { error } = await supabase.from('knowledge_groups').insert({
        workspace_id: workspaceId!,
        name,
        parent_id: parentId || null,
        color: color || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.groups(workspaceId!) })
      setNewGroupName('')
      setAddingGroupParentId(null)
      toast.success('Группа создана')
    },
    onError: () => {
      toast.error('Не удалось создать группу')
    },
  })

  const updateGroupMutation = useMutation({
    mutationFn: async ({
      id,
      name,
      color,
      parentId,
    }: {
      id: string
      name?: string
      color?: string | null
      parentId?: string | null
    }) => {
      const updates: Record<string, unknown> = {}
      if (name !== undefined) updates.name = name
      if (color !== undefined) updates.color = color
      if (parentId !== undefined) updates.parent_id = parentId
      const { error } = await supabase.from('knowledge_groups').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.groups(workspaceId!) })
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.articles(workspaceId!) })
      setEditingGroupId(null)
      setEditingGroupName('')
    },
    onError: () => {
      toast.error('Не удалось обновить группу')
    },
  })

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.from('knowledge_groups').delete().eq('id', groupId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.groups(workspaceId!) })
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.articles(workspaceId!) })
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
