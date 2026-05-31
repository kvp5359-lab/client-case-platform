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
import { useQueryClient, useMutation } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, GripVertical, Heading, Type as TypeIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { threadTemplateKeys, planKeys } from '@/hooks/queryKeys'
import { useThreadTemplatesByProjectTemplate } from '@/hooks/messenger/useThreadTemplates'
import { useTemplatePlan } from '@/hooks/plan/useTemplatePlan'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ThreadTemplateDialog } from '../ThreadTemplateDialog'
import { SortableTemplateRow } from './SortableTemplateRow'
import { HeadingBlockBody, TextBlockBody, htmlToPlain } from '@/components/plan/PlanBlockItem'
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

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: threadTemplateKeys.byProjectTemplate(projectTemplateId),
    })
    queryClient.invalidateQueries({ queryKey: threadTemplateKeys.all })
    queryClient.invalidateQueries({ queryKey: planKeys.templateByTemplate(projectTemplateId) })
  }, [queryClient, projectTemplateId])

  // ── Save ──
  const saveMutation = useMutation({
    mutationFn: async ({
      data,
      templateId,
    }: {
      data: ThreadTemplateFormData
      templateId: string | null
    }) => {
      const { assignee_ids, ...templateData } = data

      if (templateId) {
        const { error } = await supabase.rpc('update_thread_template_with_assignees', {
          p_template_id: templateId,
          p_updates: templateData,
          p_assignee_ids: assignee_ids,
        })
        if (error) throw error
      } else {
        const nextSort = maxSort + 1
        const { data: created, error } = await supabase
          .from('thread_templates')
          .insert({
            ...templateData,
            workspace_id: workspaceId,
            owner_project_template_id: projectTemplateId,
            sort_order: nextSort,
          })
          .select('id')
          .single()
        if (error) throw error
        if (assignee_ids.length > 0) {
          const { error: aErr } = await supabase
            .from('thread_template_assignees')
            .insert(assignee_ids.map((pid) => ({ template_id: created.id, participant_id: pid })))
          if (aErr) throw aErr
        }
      }
    },
    onSuccess: () => {
      invalidate()
      setIsDialogOpen(false)
      setEditingItem(null)
      toast.success('Шаблон сохранён')
    },
    onError: (error) => {
      logger.error('Ошибка сохранения шаблона треда:', error)
      toast.error('Не удалось сохранить шаблон')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('thread_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast.success('Шаблон удалён')
    },
    onError: (error) => {
      logger.error('Ошибка удаления шаблона треда:', error)
      toast.error('Не удалось удалить шаблон')
    },
  })

  const copyMutation = useMutation({
    mutationFn: async (item: ThreadTemplate) => {
      const { error } = await supabase.rpc('copy_thread_template', {
        p_template_id: item.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast.success('Шаблон скопирован')
    },
    onError: (error) => {
      logger.error('Ошибка копирования шаблона треда:', error)
      toast.error('Не удалось скопировать шаблон')
    },
  })

  // ── Reorder (единый) ──
  // Нумеруем общий список заново и пишем sort_order по индексу: задачи в
  // thread_templates, блоки в project_template_plan_blocks.
  const reorderMutation = useMutation({
    mutationFn: async ({
      taskOrders,
      blockOrders,
    }: {
      taskOrders: { id: string; sort_order: number }[]
      blockOrders: { id: string; sort_order: number }[]
    }) => {
      const results = await Promise.all(
        taskOrders.map((o) =>
          supabase.from('thread_templates').update({ sort_order: o.sort_order }).eq('id', o.id),
        ),
      )
      const firstError = results.find((r) => r.error)?.error
      if (firstError) throw firstError
      if (blockOrders.length > 0) await setBlockOrders(blockOrders)
    },
    onError: (error) => {
      logger.error('Ошибка переупорядочивания списка задач:', error)
      toast.error('Не удалось сохранить порядок')
      invalidate()
    },
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
    saveMutation.mutate({ data, templateId: editingItem?.id ?? null })
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

// ── Строка структурного блока (заголовок / текст) ──────────

function SortableContentRow({
  block,
  onChangeContent,
  onDelete,
}: {
  block: TemplatePlanBlockRow
  onChangeContent: (content: string) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  })
  const [editingText, setEditingText] = useState(false)

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  }

  const plain = htmlToPlain(block.content ?? '')

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 px-2 rounded group hover:bg-muted/60 transition-colors py-1"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none p-0.5 -m-0.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        aria-label="Переупорядочить"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      <div className="min-w-0 flex-1">
        {block.block_type === 'heading' ? (
          <HeadingBlockBody content={block.content} editing onChange={onChangeContent} />
        ) : editingText ? (
          <TextBlockBody
            content={block.content}
            onChange={onChangeContent}
            onClose={() => setEditingText(false)}
          />
        ) : (
          <div
            className="cursor-text rounded -mx-1 px-1 py-0.5 hover:bg-muted/50"
            role="button"
            tabIndex={0}
            onClick={() => setEditingText(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                setEditingText(true)
              }
            }}
          >
            {plain ? (
              <p className="text-sm whitespace-pre-wrap">{plain}</p>
            ) : (
              <p className="text-sm italic text-muted-foreground">
                Нажмите, чтобы добавить текст
              </p>
            )}
          </div>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        onClick={onDelete}
        title="Удалить"
      >
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  )
}
