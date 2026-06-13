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
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { arrayMove } from '@dnd-kit/sortable'
import type { DragEndEvent } from '@dnd-kit/core'
import { Plus, Library } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { StatusLibraryDialog } from './StatusLibraryDialog'
import { useProjectTemplateStatusesMutations } from './useProjectTemplateStatusesMutations'
import { supabase } from '@/lib/supabase'
import {
  useAllProjectStatuses,
  useProjectStatusesForTemplate,
  type TemplateProjectStatus,
} from '@/hooks/useStatuses'
import { StatusFormDialog } from '@/components/directories/StatusFormDialog'
import { StatusesTable } from '@/components/directories/StatusesTable'
import { StatusReassignDialog } from '@/components/projects/StatusReassignDialog'
import type { Database } from '@/types/database'

type Status = Database['public']['Tables']['statuses']['Row']
type StatusInsert = Database['public']['Tables']['statuses']['Insert']

type ProjectTemplateStatusesSectionProps = {
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
  final_kind: null,
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

  const { data: statuses = [], isLoading } = useProjectStatusesForTemplate(
    workspaceId,
    projectTemplateId,
  )
  const { data: allProjectStatuses = [] } = useAllProjectStatuses(workspaceId)

  const {
    tplKey,
    saveMutation,
    linkMutation,
    unlinkMutation,
    reassignAndUnlinkMutation,
    reorderMutation,
  } = useProjectTemplateStatusesMutations({ workspaceId, projectTemplateId, statuses })

  // Кандидаты для библиотечного добавления — статусы воркспейса, которых
  // ещё нет в этом шаблоне.
  const libraryCandidates = useMemo(() => {
    const taken = new Set(statuses.map((s) => s.id))
    return allProjectStatuses.filter((s) => !taken.has(s.id))
  }, [allProjectStatuses, statuses])

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
      final_kind: status.final_kind ?? null,
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
    saveMutation.mutate(
      { editing: editingStatus, data: formData },
      { onSuccess: () => setIsFormOpen(false) },
    )
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
          reassignAndUnlinkMutation.mutate(
            { statusId: reassignFor.id, replacementId },
            { onSuccess: () => setReassignFor(null) },
          )
        }}
        isPending={reassignAndUnlinkMutation.isPending}
      />

      <StatusLibraryDialog
        open={isLibraryOpen}
        onOpenChange={setIsLibraryOpen}
        candidates={libraryCandidates}
        selected={librarySelected}
        onSelectedChange={setLibrarySelected}
        onSubmit={() =>
          linkMutation.mutate(Array.from(librarySelected), {
            onSuccess: () => {
              setIsLibraryOpen(false)
              setLibrarySelected(new Set())
            },
          })
        }
        isPending={linkMutation.isPending}
      />

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
