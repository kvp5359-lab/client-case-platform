/**
 * Хук мутаций и логики для справочника статусов
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { arrayMove } from '@dnd-kit/sortable'
import type { DragEndEvent } from '@dnd-kit/core'
import { Database } from '@/types/database'
import { STALE_TIME, projectKeys } from '@/hooks/queryKeys'

type EntityType = 'project' | 'task' | 'document' | 'form' | 'document_kit'
type Status = Database['public']['Tables']['statuses']['Row']
type StatusInsert = Database['public']['Tables']['statuses']['Insert']

export type { EntityType, Status, StatusInsert }

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  project: 'Проекты',
  task: 'Задачи',
  document: 'Документы',
  form: 'Анкеты',
  document_kit: 'Наборы документов',
}

const statusesQueryKey = (workspaceId: string) => ['statuses', 'directory', workspaceId] as const

export function useStatusesDirectory(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const [selectedEntityType, setSelectedEntityType] = useState<EntityType>('project')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingStatus, setEditingStatus] = useState<Status | null>(null)
  // Реассайн при удалении project-статуса, если в нём есть проекты.
  const [reassignFor, setReassignFor] = useState<Status | null>(null)
  const [reassignCount, setReassignCount] = useState(0)
  const [formData, setFormData] = useState<StatusInsert>({
    workspace_id: workspaceId || '',
    name: '',
    description: '',
    button_label: '',
    entity_type: 'project',
    color: '#3B82F6',
    text_color: '#1F2937',
    order_index: 0,
    is_default: false,
    is_final: false,
  })

  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  // --- Загрузка статусов ---
  const {
    data: statuses = [],
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: statusesQueryKey(workspaceId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('statuses')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('entity_type')
        .order('order_index')

      if (error) throw error
      return data ?? []
    },
    enabled: !!workspaceId,
    staleTime: STALE_TIME.LONG,
  })

  // --- Мутация: сохранение ---
  const saveMutation = useMutation({
    mutationFn: async (params: { editing: Status | null; data: StatusInsert }) => {
      if (params.editing) {
        const { error } = await supabase.rpc('update_status_with_button_label', {
          status_id: params.editing.id,
          status_name: params.data.name!.trim(),
          status_description: params.data.description?.trim() ?? '',
          status_button_label: params.data.button_label?.trim() ?? '',
          status_color: params.data.color,
          status_order_index: params.data.order_index ?? 0,
          status_is_default: params.data.is_default ?? false,
          status_is_final: params.data.is_final ?? false,
          status_text_color: params.data.text_color ?? '#1F2937',
        })
        if (error) throw error

        // Дополнительные поля, не поддерживаемые RPC
        const extra: Record<string, unknown> = {}
        if ('icon' in params.data) extra.icon = params.data.icon ?? null
        if ('show_to_creator' in params.data)
          extra.show_to_creator = params.data.show_to_creator ?? false
        if ('silent_transition' in params.data)
          extra.silent_transition = params.data.silent_transition ?? false
        if (Object.keys(extra).length > 0) {
          await supabase.from('statuses').update(extra).eq('id', params.editing.id)
        }
      } else {
        const { error } = await supabase.rpc('create_status_with_button_label', {
          p_workspace_id: workspaceId ?? '',
          p_name: params.data.name!.trim(),
          p_description: params.data.description?.trim() ?? '',
          p_button_label: params.data.button_label?.trim() ?? '',
          p_entity_type: params.data.entity_type,
          p_color: params.data.color,
          p_order_index: params.data.order_index ?? 0,
          p_is_default: params.data.is_default ?? false,
          p_is_final: params.data.is_final ?? false,
          p_text_color: params.data.text_color ?? '#1F2937',
        })
        if (error) throw error

        // Для новых статусов: назначить icon, show_to_creator и silent_transition
        if (params.data.icon || params.data.show_to_creator || params.data.silent_transition) {
          const { data: created } = await supabase
            .from('statuses')
            .select('id')
            .eq('workspace_id', workspaceId ?? '')
            .eq('name', params.data.name!.trim())
            .eq('entity_type', params.data.entity_type)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (created) {
            await supabase
              .from('statuses')
              .update({
                icon: params.data.icon ?? null,
                show_to_creator: params.data.show_to_creator ?? false,
                silent_transition: params.data.silent_transition ?? false,
              })
              .eq('id', created.id)
          }
        }
      }
    },
    onSuccess: (_, params) => {
      toast.success(params.editing ? 'Статус обновлён' : 'Статус создан')
      queryClient.invalidateQueries({ queryKey: statusesQueryKey(workspaceId ?? '') })
      setIsDialogOpen(false)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить статус')
    },
  })

  // --- Мутация: удаление ---
  const deleteMutation = useMutation({
    mutationFn: async (statusId: string) => {
      const { error } = await supabase.rpc('delete_status', { p_status_id: statusId })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Статус удалён')
      queryClient.invalidateQueries({ queryKey: statusesQueryKey(workspaceId ?? '') })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить статус')
    },
  })

  // --- Мутация: реассайн проектов + удаление статуса ---
  const reassignAndDeleteMutation = useMutation({
    mutationFn: async ({
      statusId,
      replacementId,
    }: {
      statusId: string
      replacementId: string | null
    }) => {
      const { error: updErr } = await supabase
        .from('projects')
        .update({ status_id: replacementId })
        .eq('status_id', statusId)
      if (updErr) throw updErr
      const { error: delErr } = await supabase.rpc('delete_status', { p_status_id: statusId })
      if (delErr) throw delErr
    },
    onSuccess: () => {
      toast.success('Статус удалён, проекты перенесены')
      queryClient.invalidateQueries({ queryKey: statusesQueryKey(workspaceId ?? '') })
      queryClient.invalidateQueries({ queryKey: projectKeys.byWorkspace(workspaceId ?? '') })
      setReassignFor(null)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить статус')
    },
  })

  // --- Мутация: изменение порядка ---
  const reorderMutation = useMutation({
    mutationFn: async (reorderedStatuses: Status[]) => {
      const updates = reorderedStatuses.map((s, index) =>
        supabase.rpc('update_status_with_button_label', {
          status_id: s.id,
          status_name: s.name,
          status_description: s.description ?? '',
          status_button_label: s.button_label ?? '',
          status_color: s.color,
          status_order_index: index,
          status_is_default: s.is_default,
          status_is_final: s.is_final,
          status_text_color: s.text_color ?? '#1F2937',
        }),
      )
      const results = await Promise.all(updates)
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось изменить порядок')
      queryClient.invalidateQueries({ queryKey: statusesQueryKey(workspaceId ?? '') })
    },
  })

  const filteredStatuses = statuses.filter((s) => s.entity_type === selectedEntityType)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = filteredStatuses.findIndex((s) => s.id === active.id)
    const newIndex = filteredStatuses.findIndex((s) => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(filteredStatuses, oldIndex, newIndex)

    // Optimistic update
    queryClient.setQueryData(statusesQueryKey(workspaceId ?? ''), (prev: Status[] | undefined) => {
      if (!prev) return prev
      const otherStatuses = prev.filter((s) => s.entity_type !== selectedEntityType)
      const updated = reordered.map((s, i) => ({ ...s, order_index: i }))
      return [...otherStatuses, ...updated].sort((a, b) => {
        if (a.entity_type !== b.entity_type) return a.entity_type.localeCompare(b.entity_type)
        return a.order_index - b.order_index
      })
    })

    reorderMutation.mutate(reordered)
  }

  const openCreateDialog = () => {
    setEditingStatus(null)
    setFormData({
      workspace_id: workspaceId || '',
      name: '',
      description: '',
      button_label: '',
      entity_type: selectedEntityType,
      color: '#3B82F6',
      text_color: '#1F2937',
      order_index: filteredStatuses.length,
      is_default: false,
      is_final: false,
      silent_transition: false,
    })
    setIsDialogOpen(true)
  }

  const openEditDialog = (status: Status) => {
    setEditingStatus(status)
    setFormData({
      workspace_id: status.workspace_id,
      name: status.name,
      description: status.description || '',
      button_label: status.button_label || '',
      entity_type: status.entity_type,
      color: status.color,
      text_color: status.text_color || '#1F2937',
      order_index: status.order_index,
      is_default: status.is_default,
      is_final: status.is_final,
      icon: status.icon ?? null,
      show_to_creator: status.show_to_creator ?? false,
      silent_transition: status.silent_transition ?? false,
    })
    setIsDialogOpen(true)
  }

  const handleSave = () => {
    if (!formData.name?.trim()) {
      toast.error('Введите название статуса')
      return
    }
    saveMutation.mutate({ editing: editingStatus, data: formData })
  }

  const handleDelete = async (status: Status) => {
    if (status.is_system) {
      toast.error('Системные статусы нельзя удалять')
      return
    }

    // Для project-статусов проверяем usage. Если кто-то в нём — открываем
    // reassign-диалог вместо confirm. Для остальных entity_type пока такой
    // сценарий не реализован, fallback на стандартный confirm.
    if (status.entity_type === 'project') {
      const { count } = await supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('status_id', status.id)
        .eq('is_deleted', false)
      const usage = count ?? 0
      if (usage > 0) {
        setReassignFor(status)
        setReassignCount(usage)
        return
      }
    }

    const ok = await confirm({
      title: 'Удалить статус?',
      description: `Статус "${status.name}" будет удалён. Это действие нельзя отменить.`,
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return

    deleteMutation.mutate(status.id)
  }

  return {
    selectedEntityType,
    setSelectedEntityType,
    isDialogOpen,
    setIsDialogOpen,
    editingStatus,
    formData,
    setFormData,
    confirmState,
    handleConfirm,
    handleCancel,
    statuses,
    loading,
    queryError,
    filteredStatuses,
    saveMutation,
    deleteMutation,
    reassignAndDeleteMutation,
    reassignFor,
    setReassignFor,
    reassignCount,
    handleDragEnd,
    openCreateDialog,
    openEditDialog,
    handleSave,
    handleDelete,
  }
}
