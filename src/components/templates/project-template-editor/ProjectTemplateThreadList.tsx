/**
 * ProjectTemplateThreadList — список шаблонов тредов, привязанных к типу
 * проекта. Используется внутри ModulesSection в блоке "Задачи и чаты".
 *
 * Всё UI (и CRUD) устроен так же, как ThreadTemplatesContent, только:
 * - грузит через useThreadTemplatesByProjectTemplate
 * - при создании проставляет owner_project_template_id
 * - поддерживает drag-and-drop переупорядочивания (sort_order)
 * - плотная компоновка (встраивается в блок модуля)
 */

"use client"

import { useState, useCallback, useMemo, createElement } from 'react'
import Image from 'next/image'
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
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, Copy, Clock, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { threadTemplateKeys } from '@/hooks/queryKeys'
import { useThreadTemplatesByProjectTemplate } from '@/hooks/messenger/useThreadTemplates'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ThreadTemplateDialog } from '../ThreadTemplateDialog'
import { getChatIconComponent } from '@/components/messenger/ChatSettingsDialog'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import { safeCssColor } from '@/utils/isValidCssColor'
import type { ThreadTemplate, ThreadTemplateFormData } from '@/types/threadTemplate'

interface Props {
  workspaceId: string
  projectTemplateId: string
  /**
   * Фильтр по типу. Если не передан — показываются и задачи, и чаты
   * (один объединённый список под модулем "Задачи и чаты").
   */
  threadType?: 'task' | 'chat'
  /** Текст для пустого состояния. */
  emptyHint?: string
  /** Текст кнопки добавления. */
  addLabel?: string
}

// ── Sortable row ──
// Вынесено в отдельный компонент, чтобы useSortable работал на уровне
// каждого элемента (DnD-kit этого требует — хук привязан к id).

interface SortableRowProps {
  template: ThreadTemplate
  status: { name: string; color: string } | undefined
  assigneeRows: Array<{
    id: string
    name: string
    last_name: string | null
    avatar_url: string | null
  }>
  onEdit: (t: ThreadTemplate) => void
  onCopy: (t: ThreadTemplate) => void
  onDelete: (id: string) => void
}

function SortableTemplateRow({
  template: t,
  status,
  assigneeRows,
  onEdit,
  onCopy,
  onDelete,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: t.id,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2 rounded group hover:bg-muted/60 transition-colors py-1"
    >
      {/* Drag handle — grip-иконка слева, видна только при hover. */}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none p-0.5 -m-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        aria-label="Переупорядочить"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      {/* Иконка шаблона без подложки — просто lucide-иконка соответствующего
          цвета (accent_color). Если цвет не знаем — fallback на text-blue-500. */}
      {createElement(getChatIconComponent(t.icon), {
        className: cn(
          'w-4 h-4 flex-shrink-0',
          COLOR_TEXT[t.accent_color] ?? 'text-blue-500',
        ),
      })}
      <span className="text-sm truncate flex-shrink min-w-0">{t.name}</span>
      {t.description && (
        <span className="text-xs text-muted-foreground truncate flex-shrink min-w-0">
          — {t.description}
        </span>
      )}
      {/* Превью метаданных шаблона (только для задач): статус, дедлайн,
          исполнители. НЕ скрывается при hover. */}
      {t.thread_type === 'task' && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {status && (
            <span
              className="text-xs font-medium"
              style={{ color: safeCssColor(status.color) }}
              title={`Статус: ${status.name}`}
            >
              {status.name}
            </span>
          )}
          {t.deadline_days != null && (
            <span
              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
              title={`Дедлайн через ${t.deadline_days} дн.`}
            >
              <Clock className="w-3 h-3" />
              {t.deadline_days} дн.
            </span>
          )}
          {assigneeRows.length > 0 && (
            <div className="flex -space-x-1.5">
              {assigneeRows.slice(0, 3).map((p) => {
                const initial = (p.name ?? '').charAt(0).toUpperCase() || '?'
                const fullName = p.last_name ? `${p.name} ${p.last_name}` : p.name
                return p.avatar_url ? (
                  <Image
                    key={p.id}
                    src={p.avatar_url}
                    alt={fullName}
                    title={fullName}
                    width={20}
                    height={20}
                    className="w-5 h-5 rounded-full object-cover ring-2 ring-background"
                  />
                ) : (
                  <div
                    key={p.id}
                    title={fullName}
                    className="w-5 h-5 rounded-full bg-muted text-[10px] font-medium flex items-center justify-center ring-2 ring-background"
                  >
                    {initial}
                  </div>
                )
              })}
              {assigneeRows.length > 3 && (
                <div
                  title={assigneeRows
                    .slice(3)
                    .map((p) => (p.last_name ? `${p.name} ${p.last_name}` : p.name))
                    .join(', ')}
                  className="w-5 h-5 rounded-full bg-muted text-[10px] font-medium flex items-center justify-center ring-2 ring-background"
                >
                  +{assigneeRows.length - 3}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onEdit(t)}
          title="Редактировать"
        >
          <Pencil className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onCopy(t)}
          title="Копировать"
        >
          <Copy className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive"
          onClick={() => onDelete(t.id)}
          title="Удалить"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  )
}

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

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ThreadTemplate | null>(null)

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: threadTemplateKeys.byProjectTemplate(projectTemplateId),
    })
    queryClient.invalidateQueries({ queryKey: threadTemplateKeys.all })
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
        const { error } = await supabase.rpc('update_thread_template_with_assignees' as never, {
          p_template_id: templateId,
          p_updates: templateData,
          p_assignee_ids: assignee_ids,
        } as never)
        if (error) throw error
      } else {
        const nextSort = templates.length
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
      const { error } = await supabase.rpc('copy_thread_template' as never, {
        p_template_id: item.id,
      } as never)
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

  // ── Reorder (drag & drop) ──
  // sort_order обновляется батчем через отдельные UPDATE по id.
  // Supabase-js не поддерживает bulk update, поэтому шлём параллельно.
  const reorderMutation = useMutation({
    mutationFn: async (reordered: ThreadTemplate[]) => {
      const updates = reordered.map((t, i) =>
        supabase.from('thread_templates').update({ sort_order: i }).eq('id', t.id),
      )
      const results = await Promise.all(updates)
      const firstError = results.find((r) => r.error)?.error
      if (firstError) throw firstError
    },
    onError: (error) => {
      logger.error('Ошибка переупорядочивания шаблонов тредов:', error)
      toast.error('Не удалось сохранить порядок')
      // Инвалидируем кэш, чтобы откатиться к серверному порядку.
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

      const oldIndex = templates.findIndex((t) => t.id === active.id)
      const newIndex = templates.findIndex((t) => t.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(templates, oldIndex, newIndex)

      // Optimistic update: обновляем кэш query, чтобы UI отразил новый
      // порядок до возврата ответа сервера. Работа идёт с query-ключом
      // byProjectTemplate — именно он питает этот компонент.
      queryClient.setQueryData<ThreadTemplate[]>(
        threadTemplateKeys.byProjectTemplate(projectTemplateId),
        (prev) => {
          if (!prev) return prev
          // Если threadType не передан — reordered покрывает весь список.
          // Если передан — reordered это только отфильтрованная часть, а
          // в кэше лежат обе (task + chat). Нужно слить: ставим
          // переупорядоченные элементы в их новые слоты, не трогая чужой тип.
          if (!threadType) {
            return reordered.map((t, i) => ({ ...t, sort_order: i }))
          }
          const otherType = prev.filter((t) =>
            threadType === 'task' ? t.thread_type !== 'task' : t.thread_type !== 'chat',
          )
          const updatedSameType = reordered.map((t, i) => ({ ...t, sort_order: i }))
          return [...updatedSameType, ...otherType]
        },
      )

      reorderMutation.mutate(reordered)
    },
    [templates, queryClient, projectTemplateId, threadType, reorderMutation],
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
        {!isLoading && templates.length === 0 && (
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
            items={templates.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            {templates.map((t) => {
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
            })}
          </SortableContext>
        </DndContext>
        <div className="pt-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCreate}
            className="h-7 px-2 text-xs text-muted-foreground"
          >
            <Plus className="w-3 h-3 mr-1" />
            {addLabel ?? 'Добавить шаблон'}
          </Button>
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
        onSave={handleSave}
        isPending={saveMutation.isPending}
      />

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  )
}
