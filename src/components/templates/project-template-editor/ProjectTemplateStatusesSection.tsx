"use client"

/**
 * ProjectTemplateStatusesSection — управление статусами шаблона проекта.
 *
 * Модель: единый справочник project-статусов на воркспейс + junction
 * project_template_statuses. В шаблон можно (а) подключить существующий
 * статус из справочника, (б) создать новый — он добавится и в справочник,
 * и в junction. Per-template флаги (order_index, is_default, is_final)
 * хранятся в junction и могут отличаться у одного статуса в разных
 * шаблонах. Удаление «из шаблона» = удаление записи в junction (статус
 * остаётся в справочнике). Удаление статуса целиком — через директорию.
 */

import { useState, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { arrayMove } from '@dnd-kit/sortable'
import type { DragEndEvent } from '@dnd-kit/core'
import { Plus, Library } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { supabase } from '@/lib/supabase'
import {
  useAllProjectStatuses,
  useProjectStatusesForTemplate,
  type TemplateProjectStatus,
} from '@/hooks/useStatuses'
import { statusKeys, projectKeys } from '@/hooks/queryKeys'
import { StatusFormDialog } from '@/components/directories/StatusFormDialog'
import { StatusesTable } from '@/components/directories/StatusesTable'
import { StatusReassignDialog } from '@/components/projects/StatusReassignDialog'
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
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingStatus, setEditingStatus] = useState<Status | null>(null)
  const [formData, setFormData] = useState<StatusInsert>(EMPTY_FORM(workspaceId))
  const [isLibraryOpen, setIsLibraryOpen] = useState(false)
  const [librarySelected, setLibrarySelected] = useState<Set<string>>(new Set())
  const [reassignFor, setReassignFor] = useState<TemplateProjectStatus | null>(null)
  const [reassignCount, setReassignCount] = useState(0)
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const tplKey = useMemo(
    () => statusKeys.projectByTemplate(workspaceId, projectTemplateId),
    [workspaceId, projectTemplateId],
  )

  const { data: statuses = [], isLoading } = useProjectStatusesForTemplate(
    workspaceId,
    projectTemplateId,
  )
  const { data: allProjectStatuses = [] } = useAllProjectStatuses(workspaceId)

  // Кандидаты для библиотечного добавления — статусы воркспейса, которых
  // ещё нет в этом шаблоне.
  const libraryCandidates = useMemo(() => {
    const taken = new Set(statuses.map((s) => s.id))
    return allProjectStatuses.filter((s) => !taken.has(s.id))
  }, [allProjectStatuses, statuses])

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: tplKey })
    queryClient.invalidateQueries({ queryKey: statusKeys.project(workspaceId) })
  }

  // Создание нового статуса: запись в statuses + связь в junction.
  // Редактирование: апдейт справочной части (общий для всех шаблонов) +
  // апдейт per-template флагов через junction.
  const saveMutation = useMutation({
    mutationFn: async ({ editing, data }: { editing: Status | null; data: StatusInsert }) => {
      // sharedPayload пишется в саму statuses (общая для всех шаблонов).
      // is_default/is_final кладём и сюда тоже как «глобальное» значение —
      // его читают пресеты фильтров по проектам, у которых нет контекста
      // конкретного шаблона. Per-template флаги отдельно живут в junction.
      const sharedPayload = {
        name: data.name!.trim(),
        description: data.description?.trim() ?? '',
        button_label: data.button_label?.trim() ?? '',
        color: data.color,
        text_color: data.text_color ?? '#1F2937',
        icon: data.icon ?? null,
        show_to_creator: data.show_to_creator ?? false,
        silent_transition: data.silent_transition ?? false,
        is_default: data.is_default ?? false,
        is_final: data.is_final ?? false,
      }
      const tplPayload = {
        order_index: data.order_index ?? 0,
        is_default: data.is_default ?? false,
        is_final: data.is_final ?? false,
      }

      if (editing) {
        const { error: e1 } = await supabase
          .from('statuses')
          .update(sharedPayload)
          .eq('id', editing.id)
        if (e1) throw e1
        const { error: e2 } = await supabase
          .from('project_template_statuses')
          .update(tplPayload)
          .eq('template_id', projectTemplateId)
          .eq('status_id', editing.id)
        if (e2) throw e2
      } else {
        const { data: created, error: e1 } = await supabase
          .from('statuses')
          .insert({
            workspace_id: workspaceId,
            entity_type: 'project',
            ...sharedPayload,
          })
          .select('id')
          .single()
        if (e1) throw e1
        const { error: e2 } = await supabase.from('project_template_statuses').insert({
          template_id: projectTemplateId,
          status_id: created.id,
          ...tplPayload,
        })
        if (e2) throw e2
      }
    },
    onSuccess: (_, { editing }) => {
      toast.success(editing ? 'Статус обновлён' : 'Статус создан')
      invalidateAll()
      setIsFormOpen(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Не удалось сохранить'),
  })

  // Подключение существующих статусов из справочника — добавление записей
  // в junction с дефолтными флагами.
  const linkMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const baseOrder = statuses.length
      const rows = ids.map((id, i) => ({
        template_id: projectTemplateId,
        status_id: id,
        order_index: baseOrder + i,
        is_default: false,
        is_final: false,
      }))
      const { error } = await supabase.from('project_template_statuses').insert(rows)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Статусы добавлены')
      invalidateAll()
      setIsLibraryOpen(false)
      setLibrarySelected(new Set())
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Не удалось добавить'),
  })

  // Удаление «из шаблона» — отвязка через junction. Сам справочный статус
  // остаётся.
  const unlinkMutation = useMutation({
    mutationFn: async (statusId: string) => {
      const { error } = await supabase
        .from('project_template_statuses')
        .delete()
        .eq('template_id', projectTemplateId)
        .eq('status_id', statusId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Статус убран из шаблона')
      invalidateAll()
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Не удалось убрать'),
  })

  // Реассайн: переводим проекты этого шаблона на новый статус, затем
  // отвязываем удаляемый статус от шаблона.
  const reassignAndUnlinkMutation = useMutation({
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
        .eq('template_id', projectTemplateId)
      if (updErr) throw updErr
      const { error: delErr } = await supabase
        .from('project_template_statuses')
        .delete()
        .eq('template_id', projectTemplateId)
        .eq('status_id', statusId)
      if (delErr) throw delErr
    },
    onSuccess: () => {
      toast.success('Статус убран, проекты перенесены')
      invalidateAll()
      queryClient.invalidateQueries({ queryKey: projectKeys.byWorkspace(workspaceId) })
      setReassignFor(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Не удалось'),
  })

  const reorderMutation = useMutation({
    mutationFn: async (reordered: TemplateProjectStatus[]) => {
      const updates = reordered.map((s, i) =>
        supabase
          .from('project_template_statuses')
          .update({ order_index: i })
          .eq('template_id', projectTemplateId)
          .eq('status_id', s.id),
      )
      const results = await Promise.all(updates)
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onError: () => {
      toast.error('Не удалось изменить порядок')
      invalidateAll()
    },
  })

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = statuses.findIndex((s) => s.id === active.id)
    const newIndex = statuses.findIndex((s) => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(statuses, oldIndex, newIndex)
    queryClient.setQueryData<TemplateProjectStatus[]>(tplKey, () =>
      reordered.map((s, i) => ({ ...s, order_index: i })),
    )
    reorderMutation.mutate(reordered)
  }

  const openCreate = () => {
    setEditingStatus(null)
    setFormData({ ...EMPTY_FORM(workspaceId), order_index: statuses.length })
    setIsFormOpen(true)
  }

  const openEdit = (status: TemplateProjectStatus) => {
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
    setIsFormOpen(true)
  }

  const handleSave = () => {
    if (!formData.name?.trim()) {
      toast.error('Введите название статуса')
      return
    }
    saveMutation.mutate({ editing: editingStatus, data: formData })
  }

  // Удаление в данном UI = убрать из шаблона. Перед этим проверяем,
  // используется ли статус проектами этого шаблона.
  const handleRemoveFromTemplate = async (status: TemplateProjectStatus) => {
    const { count, error } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('status_id', status.id)
      .eq('template_id', projectTemplateId)
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
      title: 'Убрать из шаблона?',
      description: `Статус «${status.name}» будет убран из этого шаблона. В справочнике он останется и будет доступен другим шаблонам.`,
      variant: 'destructive',
      confirmText: 'Убрать',
    })
    if (!ok) return
    unlinkMutation.mutate(status.id)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg">Статусы проекта</CardTitle>
          <CardDescription>
            {statuses.length === 0
              ? 'Статусов пока нет — проекты этого типа будут «без статуса»'
              : `${statuses.length} статус(ов) в этом шаблоне`}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setIsLibraryOpen(true)}>
            <Library className="h-4 w-4 mr-1" />
            Из справочника
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Создать
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || statuses.length === 0 ? (
          <EmptyState
            loading={isLoading}
            emptyText="Добавьте статусы — без них проекты этого типа будут «без статуса»."
          />
        ) : (
          <StatusesTable
            statuses={statuses}
            onEdit={openEdit}
            onDelete={handleRemoveFromTemplate}
            onDragEnd={handleDragEnd}
            isDeleting={unlinkMutation.isPending || reassignAndUnlinkMutation.isPending}
          />
        )}
      </CardContent>

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />

      {/* Диалог реассайна — при удалении статуса с проектами этого шаблона */}
      <StatusReassignDialog
        open={!!reassignFor}
        onOpenChange={(o) => !o && setReassignFor(null)}
        statusToDelete={reassignFor}
        affectedProjectsCount={reassignCount}
        candidates={statuses}
        onConfirm={(replacementId) => {
          if (!reassignFor) return
          reassignAndUnlinkMutation.mutate({
            statusId: reassignFor.id,
            replacementId,
          })
        }}
        isPending={reassignAndUnlinkMutation.isPending}
      />

      {/* Диалог выбора из справочника */}
      <Dialog open={isLibraryOpen} onOpenChange={setIsLibraryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить статусы из справочника</DialogTitle>
            <DialogDescription>
              Отметьте статусы, которые нужно подключить к шаблону. Их можно потом
              переупорядочить и пометить дефолтными/финальными именно в этом шаблоне.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto py-2">
            {libraryCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Все статусы воркспейса уже добавлены в этот шаблон.
              </p>
            ) : (
              <div className="space-y-1">
                {libraryCandidates.map((s) => {
                  const checked = librarySelected.has(s.id)
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => {
                          setLibrarySelected((prev) => {
                            const next = new Set(prev)
                            if (next.has(s.id)) next.delete(s.id)
                            else next.add(s.id)
                            return next
                          })
                        }}
                      />
                      <span
                        className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="text-sm">{s.name}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setIsLibraryOpen(false)
                setLibrarySelected(new Set())
              }}
              disabled={linkMutation.isPending}
            >
              Отмена
            </Button>
            <Button
              onClick={() => linkMutation.mutate(Array.from(librarySelected))}
              disabled={linkMutation.isPending || librarySelected.size === 0}
            >
              {linkMutation.isPending ? 'Добавление…' : `Добавить (${librarySelected.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StatusFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
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
