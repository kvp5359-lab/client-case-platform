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

import { useState, useCallback, useMemo, createElement } from 'react'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Plus, Heading, Type as TypeIcon, Search, FilePlus, FolderPlus, FolderInput, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import { threadTemplateKeys, planKeys } from '@/hooks/queryKeys'
import {
  useThreadTemplatesByProjectTemplate,
  useGlobalThreadTemplates,
} from '@/hooks/messenger/useThreadTemplates'
import { useTemplatePlan } from '@/hooks/plan/useTemplatePlan'
import { useTemplateTaskGroups } from '@/hooks/plan/useTemplateTaskGroups'
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

  // Группы задач шаблона — только в общем списке (без фильтра по типу).
  const { groups, addGroup, renameGroup, deleteGroup, assignThreadToGroup, assignBlockToGroup } =
    useTemplateTaskGroups(projectTemplateId, workspaceId)
  const useGroups = showBlocks && groups.length > 0
  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.sort_order - b.sort_order),
    [groups],
  )

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

  // Порядок строк для DnD = порядок в DOM. Без групп — плоский merged; с
  // группами — секциями (верхний уровень, затем строки каждой группы по
  // порядку групп), чтобы индексы dnd-kit совпадали с версткой.
  const orderedRows = useMemo<MergedRow[]>(() => {
    if (!useGroups) return merged
    const memberOf = (m: MergedRow): string | null =>
      m.kind === 'task' ? (m.template.task_group_id ?? null) : (m.block.group_id ?? null)
    const ungrouped = merged.filter((m) => memberOf(m) === null)
    const grouped = sortedGroups.flatMap((g) => merged.filter((m) => memberOf(m) === g.id))
    return [...ungrouped, ...grouped]
  }, [merged, useGroups, sortedGroups])

  const maxSort = merged.length ? Math.max(...merged.map((m) => m.sort)) : -1

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ThreadTemplate | null>(null)

  const { saveMutation, deleteMutation, copyMutation, reorderMutation, attachMutation } =
    useProjectTemplateThreadListMutations({
      workspaceId,
      projectTemplateId,
      maxSort,
      setBlockOrders,
    })

  // Библиотека для добавления: глобальные шаблоны, ещё не привязанные к этому
  // типу, с учётом фильтра по типу треда (если задан).
  const { data: library = [] } = useGlobalThreadTemplates(workspaceId)
  const [addOpen, setAddOpen] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const attachedIds = useMemo(() => new Set(all.map((t) => t.id)), [all])
  const libraryOptions = useMemo(() => {
    const q = addSearch.trim().toLowerCase()
    return library.filter((t) => {
      if (attachedIds.has(t.id)) return false
      if (threadType === 'task' && !(t.thread_type === 'task' && !t.is_email)) return false
      if (threadType === 'chat' && !(t.thread_type === 'chat' && !t.is_email)) return false
      if (q && !t.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [library, attachedIds, threadType, addSearch])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const ids = orderedRows.map((m) => m.id)
      const oldIndex = ids.indexOf(active.id as string)
      const newIndex = ids.indexOf(over.id as string)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(orderedRows, oldIndex, newIndex)
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
    [orderedRows, queryClient, projectTemplateId, reorderMutation],
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

  // Группа строки: у задачи — thread_templates.task_group_id, у блока — group_id.
  const membershipOf = (m: MergedRow): string | null =>
    m.kind === 'task' ? (m.template.task_group_id ?? null) : (m.block.group_id ?? null)

  // Рендер одной строки. Drag работает и с группами (сортировка в порядке
  // секций через orderedRows); дропдаун «В группу» — для смены членства.
  const renderRow = (m: MergedRow) => {
    const groupControl = useGroups ? (
      <GroupAssignMenu
        currentGroupId={membershipOf(m)}
        groups={sortedGroups}
        onAssign={(gid) =>
          m.kind === 'task' ? assignThreadToGroup(m.id, gid) : assignBlockToGroup(m.id, gid)
        }
      />
    ) : undefined
    if (m.kind === 'task') {
      const t = m.template
      const status = t.default_status_id ? statusById.get(t.default_status_id) : undefined
      const assigneeRows = (t.thread_template_assignees ?? [])
        .map((a) => participantById.get(a.participant_id))
        .filter((p): p is NonNullable<typeof p> => !!p)
      return (
        <SortableTemplateRow
          key={t.id}
          template={t}
          status={status ? { name: status.name, color: status.color ?? '' } : undefined}
          assigneeRows={assigneeRows}
          onEdit={handleEdit}
          onCopy={(tpl) => copyMutation.mutate(tpl)}
          onDelete={handleDelete}
          groupControl={groupControl}
        />
      )
    }
    return (
      <SortableContentRow
        key={m.id}
        block={m.block}
        onChangeContent={(content) => updateBlock(m.block.id, { content })}
        onDelete={() => deleteBlock(m.block.id)}
        groupControl={groupControl}
      />
    )
  }

  const ungroupedRows = merged.filter((m) => membershipOf(m) === null)
  const rowsOfGroup = (gid: string) => merged.filter((m) => membershipOf(m) === gid)

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
            items={orderedRows.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            {!useGroups ? (
              // ── Плоский список: полноценный drag-реордер ──
              merged.map((m) => renderRow(m))
            ) : (
              // ── Вид с группами: верхний уровень + секции групп. Drag работает
              //    (порядок секций через orderedRows); членство — дропдауном. ──
              <div className="space-y-2">
                {ungroupedRows.length > 0 && <div>{ungroupedRows.map((m) => renderRow(m))}</div>}
                {sortedGroups.map((g) => (
                  <div key={g.id} className="rounded-md border">
                    <div className="flex items-center gap-1.5 border-b bg-muted/30 px-2 py-1.5">
                      <input
                        defaultValue={g.name}
                        key={g.name}
                        onBlur={(e) => {
                          const v = e.target.value.trim()
                          if (v && v !== g.name) renameGroup(g.id, v)
                        }}
                        className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                        placeholder="Название группы"
                      />
                      <span className="text-xs text-muted-foreground">{rowsOfGroup(g.id).length}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteGroup(g.id)}
                        title="Удалить группу"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    {rowsOfGroup(g.id).length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">
                        Пусто — назначьте задачи в группу через «В группу».
                      </p>
                    ) : (
                      <div className="py-0.5">{rowsOfGroup(g.id).map((m) => renderRow(m))}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SortableContext>
        </DndContext>
        <div className="pt-1 flex flex-wrap items-center gap-1">
          <Popover open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setAddSearch('') }}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground"
              >
                <Plus className="w-3 h-3 mr-1" />
                {addLabel ?? 'Добавить шаблон'}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-0">
              <div className="relative border-b">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  placeholder="Поиск в библиотеке..."
                  className="w-full pl-8 pr-2 py-2 text-sm bg-transparent outline-none"
                />
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {libraryOptions.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    {library.length === 0 ? 'Библиотека пуста' : 'Все подходящие уже добавлены'}
                  </p>
                ) : (
                  libraryOptions.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        attachMutation.mutate(t)
                        setAddOpen(false)
                        setAddSearch('')
                      }}
                    >
                      {createElement(getChatIconComponent(t.icon), {
                        className: cn(
                          'w-4 h-4 flex-shrink-0',
                          COLOR_TEXT[t.accent_color as ThreadAccentColor] ?? 'text-blue-500',
                        ),
                      })}
                      <span className="truncate">{t.name}</span>
                    </button>
                  ))
                )}
              </div>
              <div className="border-t">
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
                  onClick={() => {
                    setAddOpen(false)
                    setAddSearch('')
                    handleCreate()
                  }}
                >
                  <FilePlus className="w-4 h-4" />
                  Создать новый шаблон
                </button>
              </div>
            </PopoverContent>
          </Popover>
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
              <Button
                size="sm"
                variant="ghost"
                onClick={() => addGroup()}
                className="h-7 px-2 text-xs text-muted-foreground"
              >
                <FolderPlus className="w-3 h-3 mr-1" />
                Группа
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

// Дропдаун «В группу» у строки (задача/блок). Назначает/снимает группу.
function GroupAssignMenu({
  currentGroupId,
  groups,
  onAssign,
}: {
  currentGroupId: string | null
  groups: { id: string; name: string }[]
  onAssign: (groupId: string | null) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" title="В группу">
          <FolderInput className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!currentGroupId} onClick={() => onAssign(null)}>
          Без группы
        </DropdownMenuItem>
        {groups.map((g) => (
          <DropdownMenuItem
            key={g.id}
            disabled={currentGroupId === g.id}
            onClick={() => onAssign(g.id)}
          >
            {g.name || 'Без названия'}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
