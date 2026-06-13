/**
 * ProjectTemplateThreadList — список шаблонов задач/чатов типа проекта плюс
 * структурные блоки плана (заголовки и текст), привязанные к тому же типу.
 *
 * Раньше показывал только thread_templates. Теперь это единый перетаскиваемый
 * список «задачи + заголовки + текст» — как вкладка «Задачи» в самом проекте
 * (ProjectFlatPlanList). Задачи живут в thread_templates, заголовки/текст —
 * в project_template_plan_blocks (block_type heading/text). Общий порядок
 * (sort_order) — единая шкала между обеими таблицами; при создании проекта
 * блоки разворачиваются вперемешку с задачами (см. CreateProjectDialog).
 */

"use client"

import { useState, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { Button } from '@/components/ui/button'
import { Plus, Heading, Type as TypeIcon } from 'lucide-react'
import { threadTemplateKeys, planKeys } from '@/hooks/queryKeys'
import { useThreadTemplatesByProjectTemplate } from '@/hooks/messenger/useThreadTemplates'
import { useTemplatePlan } from '@/hooks/plan/useTemplatePlan'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ThreadTemplateDialog } from '../ThreadTemplateDialog'
import { SortableTemplateRow } from './SortableTemplateRow'
import { SortableContentRow } from './SortableContentRow'
import { useProjectTemplateThreadListMutations } from './useProjectTemplateThreadListMutations'
import type { ThreadTemplate, ThreadTemplateFormData } from '@/types/threadTemplate'
import type { TemplatePlanBlockRow } from '@/types/plan'

type Props = {
  workspaceId: string
  projectTemplateId: string
  /**
   * Фильтр по типу. Если не передан — показываются и задачи, и чаты, плюс
   * структурные блоки (заголовки/текст). С фильтром блоки скрыты.
   */
  threadType?: 'task' | 'chat'
  /** Текст для пустого состояния. */
  emptyHint?: string
  /** Текст кнопки добавления задачи. */
  addLabel?: string
}

type MergedRow =
  | { kind: 'task'; id: string; sort: number; template: ThreadTemplate }
  | { kind: 'block'; id: string; sort: number; block: TemplatePlanBlockRow }

export function ProjectTemplateThreadList({
  workspaceId,
  projectTemplateId,
  threadType,
  emptyHint,
  addLabel,
}: Props) {
  const queryClient = useQueryClient()
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()
  const { data: all = [], isLoading } = useThreadTemplatesByProjectTemplate(projectTemplateId)

  // Структурные блоки (заголовки/текст) показываем только в общем списке задач
  // (без фильтра по типу) — как вкладка «Задачи» в проекте.
  const showBlocks = !threadType
  const { blocks, addHeadingBlock, addTextBlock, updateBlock, deleteBlock, setBlockOrders } =
    useTemplatePlan(projectTemplateId, workspaceId)

  const { data: participants = [] } = useWorkspaceParticipants(workspaceId)
  const participantById = useMemo(() => {
    const map = new Map<string, (typeof participants)[number]>()
    for (const p of participants) map.set(p.id, p)
    return map
  }, [participants])

  const { data: taskStatuses = [] } = useTaskStatuses(workspaceId)
  const statusById = useMemo(() => {
    const map = new Map<string, (typeof taskStatuses)[number]>()
    for (const s of taskStatuses) map.set(s.id, s)
    return map
  }, [taskStatuses])

  // Фильтрация по типу: если threadType не передан — показываем всё.
  const templates = !threadType
    ? all
    : all.filter((t) =>
        threadType === 'task' ? t.thread_type === 'task' : t.thread_type === 'chat',
      )

  const contentBlocks = useMemo(
    () =>
      showBlocks
        ? blocks.filter((b) => b.block_type === 'heading' || b.block_type === 'text')
        : [],
    [blocks, showBlocks],
  )

  // Единый список: задачи + заголовки/текст по общей шкале sort_order.
  const merged = useMemo<MergedRow[]>(() => {
    const rows: MergedRow[] = []
    for (const t of templates) {
      rows.push({ kind: 'task', id: t.id, sort: t.sort_order ?? 0, template: t })
    }
    for (const b of contentBlocks) {
      rows.push({ kind: 'block', id: b.id, sort: b.sort_order, block: b })
    }
    rows.sort((a, b) => a.sort - b.sort || (a.kind === 'task' ? -1 : 1))
    return rows
  }, [templates, contentBlocks])

  const maxSort = merged.length ? Math.max(...merged.map((m) => m.sort)) : -1

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ThreadTemplate | null>(null)

  const { saveMutation, deleteMutation, copyMutation, reorderMutation } =
    useProjectTemplateThreadListMutations({
      workspaceId,
      projectTemplateId,
      maxSort,
      setBlockOrders,
    })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const ids = merged.map((m) => m.id)
      const oldIndex = ids.indexOf(active.id as string)
      const newIndex = ids.indexOf(over.id as string)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(merged, oldIndex, newIndex)
      const taskOrders: { id: string; sort_order: number }[] = []
      const blockOrders: { id: string; sort_order: number }[] = []
      reordered.forEach((m, i) => {
        if (m.kind === 'task') taskOrders.push({ id: m.id, sort_order: i })
        else blockOrders.push({ id: m.id, sort_order: i })
      })

      // Оптимистично обновляем оба кэша, чтобы строки двигались сразу.
      const taskMap = new Map(taskOrders.map((o) => [o.id, o.sort_order]))
      queryClient.setQueryData<ThreadTemplate[]>(
        threadTemplateKeys.byProjectTemplate(projectTemplateId),
        (prev) =>
          prev
            ? prev.map((t) =>
                taskMap.has(t.id) ? { ...t, sort_order: taskMap.get(t.id)! } : t,
              )
            : prev,
      )
      const blockMap = new Map(blockOrders.map((o) => [o.id, o.sort_order]))
      queryClient.setQueryData<TemplatePlanBlockRow[]>(
        planKeys.templateByTemplate(projectTemplateId),
        (prev) =>
          prev
            ? prev.map((b) =>
                blockMap.has(b.id) ? { ...b, sort_order: blockMap.get(b.id)! } : b,
              )
            : prev,
      )

      reorderMutation.mutate({ taskOrders, blockOrders })
    },
    [merged, queryClient, projectTemplateId, reorderMutation],
  )

  const handleCreate = () => {
    setEditingItem(null)
    setIsDialogOpen(true)
  }

  const handleEdit = (item: ThreadTemplate) => {
    setEditingItem(item)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Удалить шаблон',
      description: 'Шаблон будет удалён без возможности восстановления.',
      confirmText: 'Удалить',
      variant: 'destructive',
    })
    if (!ok) return
    await deleteMutation.mutateAsync(id)
  }

  const handleSave = (data: ThreadTemplateFormData) => {
    saveMutation.mutate(
      { data, templateId: editingItem?.id ?? null },
      {
        onSuccess: () => {
          setIsDialogOpen(false)
          setEditingItem(null)
        },
      },
    )
  }

  return (
    <div className="bg-background px-4 py-2 border-t">
      <div className="space-y-0.5">
        {isLoading && (
          <div className="text-xs text-muted-foreground px-2 py-1">Загрузка...</div>
        )}
        {!isLoading && merged.length === 0 && (
          <div className="text-xs text-muted-foreground px-2 py-1">
            {emptyHint ?? 'Шаблонов пока нет'}
          </div>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={merged.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            {merged.map((m) => {
              if (m.kind === 'task') {
                const t = m.template
                const status = t.default_status_id
                  ? statusById.get(t.default_status_id)
                  : undefined
                const assigneeRows = (t.thread_template_assignees ?? [])
                  .map((a) => participantById.get(a.participant_id))
                  .filter((p): p is NonNullable<typeof p> => !!p)
                return (
                  <SortableTemplateRow
                    key={t.id}
                    template={t}
                    status={
                      status ? { name: status.name, color: status.color ?? '' } : undefined
                    }
                    assigneeRows={assigneeRows}
                    onEdit={handleEdit}
                    onCopy={(tpl) => copyMutation.mutate(tpl)}
                    onDelete={handleDelete}
                  />
                )
              }
              return (
                <SortableContentRow
                  key={m.id}
                  block={m.block}
                  onChangeContent={(content) => updateBlock(m.block.id, { content })}
                  onDelete={() => deleteBlock(m.block.id)}
                />
              )
            })}
          </SortableContext>
        </DndContext>
        <div className="pt-1 flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCreate}
            className="h-7 px-2 text-xs text-muted-foreground"
          >
            <Plus className="w-3 h-3 mr-1" />
            {addLabel ?? 'Добавить шаблон'}
          </Button>
          {showBlocks && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => addHeadingBlock('', maxSort + 1)}
                className="h-7 px-2 text-xs text-muted-foreground"
              >
                <Heading className="w-3 h-3 mr-1" />
                Заголовок
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => addTextBlock('', maxSort + 1)}
                className="h-7 px-2 text-xs text-muted-foreground"
              >
                <TypeIcon className="w-3 h-3 mr-1" />
                Текст
              </Button>
            </>
          )}
        </div>
      </div>

      <ThreadTemplateDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open)
          if (!open) setEditingItem(null)
        }}
        workspaceId={workspaceId}
        template={editingItem}
        ownerProjectTemplateIdOverride={projectTemplateId}
        onSave={handleSave}
        isPending={saveMutation.isPending}
      />

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  )
}
