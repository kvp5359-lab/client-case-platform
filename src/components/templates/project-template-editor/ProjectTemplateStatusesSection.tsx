"use client"

/**
 * ProjectTemplateStatusesSection — управление статусами шаблона проекта.
 *
 * Наследование: проекты, созданные по этому шаблону, видят ИМЕННО эти статусы
 * (через `useProjectStatusesForTemplate`). Если у шаблона нет своих статусов,
 * проекты используют общие воркспейсные (project_template_id IS NULL).
 *
 * Технически — те же `statuses` (entity_type='project'), но с проставленным
 * `project_template_id`. Идём напрямую через таблицу: RLS-политика
 * `manage_statuses` уже отрабатывает корректно.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { arrayMove } from '@dnd-kit/sortable'
import type { DragEndEvent } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { supabase } from '@/lib/supabase'
import { statusKeys } from '@/hooks/queryKeys'
import { StatusFormDialog } from '@/components/directories/StatusFormDialog'
import { StatusesTable } from '@/components/directories/StatusesTable'
import { StatusReassignDialog } from '@/components/projects/StatusReassignDialog'
import { projectKeys } from '@/hooks/queryKeys'
import type { Database } from '@/types/database'

type Status = Database['public']['Tables']['statuses']['Row']
type StatusInsert = Database['public']['Tables']['statuses']['Insert']

interface ProjectTemplateStatusesSectionProps {
  workspaceId: string
  projectTemplateId: string
}

const EMPTY_FORM = (workspaceId: string): StatusInsert => ({
  workspace_id: workspaceId,
  name: '',
  description: '',
  button_label: '',
  entity_type: 'project',
  color: '#3B82F6',
  text_color: '#1F2937',
  order_index: 0,
  is_default: false,
  is_final: false,
  silent_transition: false,
})

export function ProjectTemplateStatusesSection({
  workspaceId,
  projectTemplateId,
}: ProjectTemplateStatusesSectionProps) {
  const queryClient = useQueryClient()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingStatus, setEditingStatus] = useState<Status | null>(null)
  const [formData, setFormData] = useState<StatusInsert>(EMPTY_FORM(workspaceId))
  // Реассайн при удалении: статус, кол-во проектов, открытость диалога.
  const [reassignFor, setReassignFor] = useState<Status | null>(null)
  const [reassignCount, setReassignCount] = useState(0)
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  // Один кэш на воркспейс (project-статусы) — фильтруем на клиенте по
  // project_template_id, чтобы не плодить ключи.
  const queryKey = statusKeys.project(workspaceId)
  const { data: allProjectStatuses = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('statuses')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('entity_type', 'project')
        .order('order_index', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!workspaceId,
  })

  const statuses = allProjectStatuses.filter((s) => s.project_template_id === projectTemplateId)

  const saveMutation = useMutation({
    mutationFn: async ({ editing, data }: { editing: Status | null; data: StatusInsert }) => {
      const payload = {
        workspace_id: workspaceId,
        entity_type: 'project' as const,
        project_template_id: projectTemplateId,
        name: data.name!.trim(),
        description: data.description?.trim() ?? '',
        button_label: data.button_label?.trim() ?? '',
        color: data.color,
        text_color: data.text_color ?? '#1F2937',
        order_index: data.order_index ?? 0,
        is_default: data.is_default ?? false,
        is_final: data.is_final ?? false,
        icon: data.icon ?? null,
        show_to_creator: data.show_to_creator ?? false,
        silent_transition: data.silent_transition ?? false,
      }
      if (editing) {
        const { error } = await supabase.from('statuses').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('statuses').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: (_, { editing }) => {
      toast.success(editing ? 'Статус обновлён' : 'Статус создан')
      queryClient.invalidateQueries({ queryKey })
      setIsDialogOpen(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Не удалось сохранить'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (statusId: string) => {
      const { error } = await supabase.rpc('delete_status', { p_status_id: statusId })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Статус удалён')
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Не удалось удалить'),
  })

  // Реассайн + удаление одной транзакцией с точки зрения UX:
  // 1) UPDATE projects SET status_id=replacement WHERE status_id=deleted
  // 2) DELETE статус
  // Если что-то падает на 1 — статус не трогаем.
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
      queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: projectKeys.byWorkspace(workspaceId) })
      setReassignFor(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Не удалось удалить'),
  })

  const reorderMutation = useMutation({
    mutationFn: async (reordered: Status[]) => {
      const updates = reordered.map((s, i) =>
        supabase.from('statuses').update({ order_index: i }).eq('id', s.id),
      )
      const results = await Promise.all(updates)
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onError: () => {
      toast.error('Не удалось изменить порядок')
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = statuses.findIndex((s) => s.id === active.id)
    const newIndex = statuses.findIndex((s) => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(statuses, oldIndex, newIndex)
    queryClient.setQueryData<Status[]>(queryKey, (prev) => {
      if (!prev) return prev
      const others = prev.filter((s) => s.project_template_id !== projectTemplateId)
      const updated = reordered.map((s, i) => ({ ...s, order_index: i }))
      return [...others, ...updated]
    })
    reorderMutation.mutate(reordered)
  }

  const openCreate = () => {
    setEditingStatus(null)
    setFormData({ ...EMPTY_FORM(workspaceId), order_index: statuses.length })
    setIsDialogOpen(true)
  }

  const openEdit = (status: Status) => {
    setEditingStatus(status)
    setFormData({
      workspace_id: status.workspace_id,
      name: status.name,
      description: status.description || '',
      button_label: status.button_label || '',
      entity_type: 'project',
      color: status.color,
      text_color: status.text_color ?? '#1F2937',
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
    // Сначала проверяем, есть ли проекты в этом статусе. Если есть —
    // открываем диалог реассайна, иначе обычный confirm.
    const { count, error } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('status_id', status.id)
      .eq('is_deleted', false)
    if (error) {
      toast.error('Не удалось проверить использование статуса')
      return
    }
    const usage = count ?? 0
    if (usage > 0) {
      setReassignFor(status)
      setReassignCount(usage)
      return
    }
    const ok = await confirm({
      title: 'Удалить статус?',
      description: `Статус «${status.name}» будет удалён. Это действие нельзя отменить.`,
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return
    deleteMutation.mutate(status.id)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg">Статусы проекта</CardTitle>
          <CardDescription>
            {statuses.length === 0
              ? 'Своих статусов нет — проекты будут использовать общие статусы воркспейса'
              : `${statuses.length} статус(ов) для этого шаблона`}
          </CardDescription>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Добавить
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading || statuses.length === 0 ? (
          <EmptyState
            loading={isLoading}
            emptyText="Своих статусов пока нет. Добавьте, чтобы переопределить общий набор."
          />
        ) : (
          <StatusesTable
            statuses={statuses}
            onEdit={openEdit}
            onDelete={handleDelete}
            onDragEnd={handleDragEnd}
            isDeleting={deleteMutation.isPending}
          />
        )}
      </CardContent>

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />

      <StatusReassignDialog
        open={!!reassignFor}
        onOpenChange={(o) => !o && setReassignFor(null)}
        statusToDelete={reassignFor}
        affectedProjectsCount={reassignCount}
        // Кандидаты для замены: статусы того же шаблона + общие воркспейсные.
        // Удаляемый сам отфильтруется внутри диалога.
        candidates={allProjectStatuses.filter(
          (s) =>
            s.project_template_id === projectTemplateId || s.project_template_id === null,
        )}
        onConfirm={(replacementId) => {
          if (!reassignFor) return
          reassignAndDeleteMutation.mutate({ statusId: reassignFor.id, replacementId })
        }}
        isPending={reassignAndDeleteMutation.isPending}
      />

      <StatusFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        editingStatus={editingStatus}
        formData={formData}
        onFormDataChange={setFormData}
        onSave={handleSave}
        saving={saveMutation.isPending}
        entityTypeLabel="Проекты"
      />
    </Card>
  )
}
