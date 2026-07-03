/**
 * Список шаблонов тредов в настройках workspace → Шаблоны.
 * CRUD через useTemplateList + ThreadTemplateDialog.
 */

import { useState, useCallback, createElement } from 'react'
import { useParams } from 'next/navigation'
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
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageLoader } from '@/components/ui/loaders'
import {
  Plus,
  Search,
  Copy,
  Pencil,
  Trash2,
  MessageSquare,
  CheckSquare,
  Mail,
  GripVertical,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { threadTemplateKeys } from '@/hooks/queryKeys'
import { useGlobalThreadTemplates } from '@/hooks/messenger/useThreadTemplates'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ThreadTemplateDialog } from './ThreadTemplateDialog'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import type { ThreadTemplate, ThreadTemplateFormData } from '@/types/threadTemplate'

function getTypeBadge(t: ThreadTemplate) {
  if (t.is_email)
    return (
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
        <Mail className="w-3 h-3" /> Email
      </span>
    )
  if (t.thread_type === 'task')
    return (
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
        <CheckSquare className="w-3 h-3" /> Задача
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
      <MessageSquare className="w-3 h-3" /> Чат
    </span>
  )
}

/** Строка шаблона. Перетаскиваемая, когда передан draggable=true. */
function TemplateRow({
  t,
  draggable,
  onEdit,
  onCopy,
  onDelete,
}: {
  t: ThreadTemplate
  draggable: boolean
  onEdit: (t: ThreadTemplate) => void
  onCopy: (t: ThreadTemplate) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: t.id,
    disabled: !draggable,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 group bg-background',
        isDragging && 'opacity-50',
      )}
    >
      {draggable && (
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground"
          aria-label="Перетащить"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Icon в цвет акцента, без плашки */}
      {createElement(getChatIconComponent(t.icon), {
        className: cn(
          'w-4 h-4 flex-shrink-0',
          COLOR_TEXT[t.accent_color as ThreadAccentColor] ?? 'text-blue-500',
        ),
      })}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{t.name}</span>
          {getTypeBadge(t)}
          {/* Actions — сразу справа от типа треда */}
          <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onEdit(t)}
              title="Редактировать"
              aria-label="Редактировать шаблон"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onCopy(t)}
              title="Копировать"
              aria-label="Копировать шаблон"
            >
              <Copy className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={() => onDelete(t.id)}
              title="Удалить"
              aria-label="Удалить шаблон"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        {t.description && (
          <p className="text-xs text-muted-foreground truncate">{t.description}</p>
        )}
      </div>
    </div>
  )
}

export function ThreadTemplatesContent() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const queryClient = useQueryClient()
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  // Показываем только ГЛОБАЛЬНЫЕ шаблоны (owner_project_template_id IS NULL).
  // Шаблоны, привязанные к конкретному типу проекта, редактируются внутри
  // соответствующего редактора типа проекта (модули "Задачи" / "Чаты").
  const { data: templates = [], isLoading } = useGlobalThreadTemplates(workspaceId)

  const [searchQuery, setSearchQuery] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ThreadTemplate | null>(null)

  const invalidate = useCallback(() => {
    // Инвалидируем все варианты ключей шаблонов для этого workspace, чтобы
    // глобальные/scoped/context-списки обновились одновременно.
    queryClient.invalidateQueries({ queryKey: threadTemplateKeys.all })
  }, [queryClient])

  // ── Save mutation ──
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
        // Update template + replace assignees atomically via RPC
        const { error } = await supabase.rpc('update_thread_template_with_assignees', {
          p_template_id: templateId,
          p_updates: templateData,
          p_assignee_ids: assignee_ids,
        })
        if (error) throw error
      } else {
        // Create
        const { data: created, error } = await supabase
          .from('thread_templates')
          .insert({ ...templateData, workspace_id: workspaceId ?? '' })
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

  // ── Delete mutation ──
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

  // ── Copy mutation ──
  const copyMutation = useMutation({
    mutationFn: async (item: ThreadTemplate) => {
      // Copy template + assignees atomically via RPC
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

  // ── Reorder mutation (порядок библиотеки = thread_templates.sort_order) ──
  const reorderMutation = useMutation({
    mutationFn: async (orders: { id: string; sort_order: number }[]) => {
      const results = await Promise.all(
        orders.map((o) =>
          supabase.from('thread_templates').update({ sort_order: o.sort_order }).eq('id', o.id),
        ),
      )
      const firstError = results.find((r) => r.error)?.error
      if (firstError) throw firstError
    },
    onError: (error) => {
      logger.error('Ошибка переупорядочивания шаблонов:', error)
      toast.error('Не удалось сохранить порядок')
      invalidate()
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  // ── Handlers ──
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

  // ── Filter ──
  const filtered = templates.filter((t) => {
    const q = searchQuery.toLowerCase()
    return t.name.toLowerCase().includes(q) || (t.description?.toLowerCase().includes(q) ?? false)
  })

  // Перетаскивание доступно только без активного поиска (иначе индексы списка
  // не совпадают с полным набором → порядок сохранился бы неверно).
  const dndEnabled = searchQuery.trim() === ''

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = templates.map((t) => t.id)
    const oldIndex = ids.indexOf(active.id as string)
    const newIndex = ids.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(templates, oldIndex, newIndex)
    const orders = reordered.map((t, i) => ({ id: t.id, sort_order: i }))

    // Оптимистично обновляем кэш глобальной библиотеки.
    const orderMap = new Map(orders.map((o) => [o.id, o.sort_order]))
    queryClient.setQueryData<ThreadTemplate[]>(
      threadTemplateKeys.globalByWorkspace(workspaceId ?? ''),
      (prev) =>
        prev
          ? [...prev]
              .map((t) => (orderMap.has(t.id) ? { ...t, sort_order: orderMap.get(t.id)! } : t))
              .sort((a, b) => a.sort_order - b.sort_order)
          : prev,
    )

    reorderMutation.mutate(orders)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Шаблоны тредов</h2>
          <p className="text-sm text-muted-foreground">
            Быстрое создание чатов, задач и email-каналов по шаблону
          </p>
        </div>
        <Button onClick={handleCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          Создать шаблон
        </Button>
      </div>

      {/* Search */}
      {templates.length > 3 && (
        <div className="relative mb-4">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по шаблонам..."
            className="pl-8 h-9"
          />
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <PageLoader />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {templates.length === 0 ? 'Шаблонов пока нет' : 'Ничего не найдено'}
        </p>
      ) : (
        <div className="border rounded-lg divide-y">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filtered.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {filtered.map((t) => (
                <TemplateRow
                  key={t.id}
                  t={t}
                  draggable={dndEnabled}
                  onEdit={handleEdit}
                  onCopy={(tpl) => copyMutation.mutate(tpl)}
                  onDelete={handleDelete}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Dialog */}
      <ThreadTemplateDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open)
          if (!open) setEditingItem(null)
        }}
        workspaceId={workspaceId ?? ''}
        template={editingItem}
        onSave={handleSave}
        isPending={saveMutation.isPending}
      />

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  )
}
