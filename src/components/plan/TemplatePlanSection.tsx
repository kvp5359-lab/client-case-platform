"use client"

/**
 * Редактор «рыбы» плана в шаблоне проекта (Фаза 3).
 *
 * Собирается один раз для типа проекта; при создании проекта разворачивается
 * в живой план (seed в CreateProjectDialog). Блоки: текст + задача (ссылка на
 * thread_template). Слоты в шаблоне отложены (см. useTemplatePlan).
 *
 * См. docs/feature-backlog/2026-05-30-plan-module.md
 */

import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical,
  Trash2,
  Type as TypeIcon,
  CheckSquare,
  AlertTriangle,
  FolderPlus,
  FolderInput,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { useTemplateTaskGroups } from '@/hooks/plan/useTemplateTaskGroups'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import { TiptapEditor } from '@/components/tiptap-editor/tiptap-editor'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTemplatePlan } from '@/hooks/plan/useTemplatePlan'
import { useThreadTemplatesForProject } from '@/hooks/messenger/useThreadTemplates'
import { PLAN_TEXT_CLASS } from './planTextClass'
import type { TemplatePlanBlockRow } from '@/types/plan'
import { RowsSkeleton } from '@/components/ui/loaders'

type Props = {
  workspaceId: string
  templateId: string
  enabledModules: string[]
}

export function TemplatePlanSection({ workspaceId, templateId, enabledModules }: Props) {
  const {
    blocks,
    isLoading,
    addTextBlock,
    addTaskBlocks,
    updateBlock,
    deleteBlock,
    reorderBlocks,
  } = useTemplatePlan(templateId, workspaceId)
  const { data: threadTemplates = [] } = useThreadTemplatesForProject(workspaceId, templateId)
  const { groups, addGroup, renameGroup, deleteGroup, assignBlockToGroup } =
    useTemplateTaskGroups(templateId, workspaceId)
  const hasGroups = groups.length > 0
  const groupOptions = useMemo(() => groups.map((g) => ({ id: g.id, name: g.name })), [groups])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedTpl, setSelectedTpl] = useState<Set<string>>(new Set())

  const toggleTpl = (id: string) =>
    setSelectedTpl((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const tplMap = useMemo(() => {
    const m = new Map<string, { name: string; icon: string | null; accent_color: string | null }>()
    for (const t of threadTemplates) {
      m.set(t.id, { name: t.name, icon: t.icon, accent_color: t.accent_color })
    }
    return m
  }, [threadTemplates])

  const usedTplIds = useMemo(
    () => new Set(blocks.filter((b) => b.block_type === 'task').map((b) => b.thread_template_id)),
    [blocks],
  )
  const availableTemplates = useMemo(
    () => threadTemplates.filter((t) => !usedTplIds.has(t.id)),
    [threadTemplates, usedTplIds],
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = blocks.map((b) => b.id)
    const oldIndex = ids.indexOf(active.id as string)
    const newIndex = ids.indexOf(over.id as string)
    if (oldIndex < 0 || newIndex < 0) return
    reorderBlocks(arrayMove(ids, oldIndex, newIndex))
  }

  const blocksByGroup = useMemo(() => {
    const m = new Map<string, TemplatePlanBlockRow[]>()
    for (const g of groups) m.set(g.id, [])
    for (const b of blocks) if (b.group_id && m.has(b.group_id)) m.get(b.group_id)!.push(b)
    return m
  }, [blocks, groups])
  const ungroupedBlocks = useMemo(
    () => blocks.filter((b) => !b.group_id || !blocksByGroup.has(b.group_id)),
    [blocks, blocksByGroup],
  )

  const renderTemplateBlock = (block: TemplatePlanBlockRow, disabled?: boolean) => (
    <SortableTemplateBlock
      key={block.id}
      block={block}
      tpl={block.thread_template_id ? tplMap.get(block.thread_template_id) : undefined}
      onChangeText={(html) => updateBlock(block.id, { content: html })}
      onDelete={() => deleteBlock(block.id)}
      sortableDisabled={disabled}
      groupOptions={hasGroups ? groupOptions : undefined}
      currentGroupId={block.group_id}
      onAssignGroup={hasGroups ? (gid) => assignBlockToGroup(block.id, gid) : undefined}
    />
  )

  const planEnabled = enabledModules.includes('plan')

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">План проекта</h3>
        <p className="text-sm text-muted-foreground">
          «Рыба» плана для новых проектов этого типа. При создании проекта блоки
          развернутся автоматически: текст скопируется, задачи привяжутся к созданным
          задачам проекта.
        </p>
        {!planEnabled && (
          <p className="mt-1 text-sm text-amber-600">
            Модуль «План» выключен в шаблоне — план не будет виден в проектах, пока не
            включишь его во вкладке «Модули».
          </p>
        )}
      </div>

      {isLoading ? (
        <RowsSkeleton count={4} />
      ) : blocks.length === 0 && !hasGroups ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
          План пуст. Добавьте текст, задачу или группу ниже.
        </p>
      ) : !hasGroups ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col rounded-md border">
              {blocks.map((block) => renderTemplateBlock(block))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        // Вид с группами: секции. DnD-перетаскивание в шаблоне не используется —
        // назначение группы через дропдаун у блока. Dnd/SortableContext нужны
        // только чтобы useSortable внутри строк имел контекст (drag отключён).
        <DndContext sensors={sensors} collisionDetection={closestCenter}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {ungroupedBlocks.length > 0 && (
            <div className="flex flex-col rounded-md border">
              {ungroupedBlocks.map((block) => renderTemplateBlock(block, true))}
            </div>
          )}
          {groups.map((g) => (
            <div key={g.id} className="rounded-md border">
              <div className="flex items-center gap-1.5 border-b bg-muted/30 px-2 py-1.5">
                <input
                  defaultValue={g.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v && v !== g.name) renameGroup(g.id, v)
                  }}
                  className="flex-1 min-w-0 bg-transparent text-sm font-semibold outline-none"
                />
                <span className="text-xs text-muted-foreground">{blocksByGroup.get(g.id)?.length ?? 0}</span>
                <Button
                  type="button" variant="ghost" size="icon"
                  className="size-6 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteGroup(g.id)}
                  title="Удалить группу"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              {(blocksByGroup.get(g.id)?.length ?? 0) === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Пусто — назначьте блоки в группу.</p>
              ) : (
                <div className="flex flex-col">
                  {blocksByGroup.get(g.id)!.map((block) => renderTemplateBlock(block, true))}
                </div>
              )}
            </div>
          ))}
        </div>
        </SortableContext>
        </DndContext>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Добавить:</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => addTextBlock('<p></p>')}
        >
          <TypeIcon className="size-3.5" /> Текст
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setPickerOpen(true)}
        >
          <CheckSquare className="size-3.5" /> Задача
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => addGroup()}
        >
          <FolderPlus className="size-3.5" /> Группа
        </Button>
      </div>

      <Dialog
        open={pickerOpen}
        onOpenChange={(v) => {
          setPickerOpen(v)
          if (!v) setSelectedTpl(new Set())
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Добавить задачу в план</DialogTitle>
          </DialogHeader>
          {availableTemplates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Все шаблоны задач уже в плане или их нет. Шаблоны задач настраиваются во вкладке
              «Модули».
            </p>
          ) : (
            <>
              <div className="-mx-1 max-h-80 space-y-0.5 overflow-y-auto px-1">
                {availableTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTpl(t.id)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <Checkbox checked={selectedTpl.has(t.id)} className="pointer-events-none" />
                    {createElement(getChatIconComponent(t.icon ?? ''), {
                      className: `size-4 shrink-0 ${COLOR_TEXT[(t.accent_color ?? "") as ThreadAccentColor] ?? 'text-muted-foreground'}`,
                    })}
                    <span className="truncate">{t.name}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 border-t pt-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    addTaskBlocks(availableTemplates.map((t) => t.id))
                    setSelectedTpl(new Set())
                    setPickerOpen(false)
                  }}
                >
                  Добавить все ({availableTemplates.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={selectedTpl.size === 0}
                  onClick={() => {
                    addTaskBlocks([...selectedTpl])
                    setSelectedTpl(new Set())
                    setPickerOpen(false)
                  }}
                >
                  Добавить{selectedTpl.size > 0 ? ` (${selectedTpl.size})` : ''}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Sortable-обёртка ──────────────────────────────────────

function SortableTemplateBlock({
  block,
  tpl,
  onChangeText,
  onDelete,
  sortableDisabled,
  groupOptions,
  currentGroupId,
  onAssignGroup,
}: {
  block: TemplatePlanBlockRow
  tpl: { name: string } | undefined
  onChangeText: (html: string) => void
  onDelete: () => void
  sortableDisabled?: boolean
  groupOptions?: { id: string; name: string }[]
  currentGroupId?: string | null
  onAssignGroup?: (groupId: string | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    disabled: !!sortableDisabled,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-start gap-2 border-b px-2 py-1.5 last:border-b-0 ${isDragging ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        className={`mt-1 text-muted-foreground/50 hover:text-muted-foreground ${sortableDisabled ? 'cursor-default opacity-30' : 'cursor-grab'}`}
        {...attributes}
        {...listeners}
        aria-label="Перетащить"
      >
        <GripVertical className="size-4" />
      </button>

      <div className="min-w-0 flex-1">
        {block.block_type === 'text' || block.block_type === 'heading' ? (
          <TemplateTextBlock content={block.content} onChangeText={onChangeText} />
        ) : tpl ? (
          <div className="flex items-center gap-2 py-1">
            <span className="truncate text-sm">{tpl.name}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
            <AlertTriangle className="size-4 text-amber-500" />
            <span className="italic">Шаблон задачи удалён</span>
          </div>
        )}
      </div>

      <div className="flex items-center pt-0.5">
        {groupOptions && onAssignGroup && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button" variant="ghost" size="icon"
                className="size-7 text-muted-foreground"
                title="В группу"
              >
                <FolderInput className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={!currentGroupId} onClick={() => onAssignGroup(null)}>
                Без группы
              </DropdownMenuItem>
              {groupOptions.map((g) => (
                <DropdownMenuItem
                  key={g.id}
                  disabled={currentGroupId === g.id}
                  onClick={() => onAssignGroup(g.id)}
                >
                  {g.name || 'Без названия'}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          aria-label="Удалить блок"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function TemplateTextBlock({
  content,
  onChangeText,
}: {
  content: string | null
  onChangeText: (html: string) => void
}) {
  const [html, setHtml] = useState(content ?? '')
  const [active, setActive] = useState(false)
  const editorWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) return
    if (html === (content ?? '')) return
    const t = setTimeout(() => onChangeText(html), 800)
    return () => clearTimeout(t)
  }, [html, active, content, onChangeText])

  useEffect(() => {
    if (!active) return
    const id = setTimeout(() => {
      const el = editorWrapRef.current?.querySelector(
        '[contenteditable="true"]',
      ) as HTMLElement | null
      el?.focus()
    }, 40)
    return () => clearTimeout(id)
  }, [active])

  const isEmpty = !content || content === '<p></p>'

  // По умолчанию — чистый текст, редактор раскрывается по клику.
  if (!active) {
    return (
      <div
        className="cursor-text rounded -mx-1 px-1 py-0.5 hover:bg-muted/50"
        onClick={() => setActive(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            setActive(true)
          }
        }}
      >
        {isEmpty ? (
          <p className="text-sm italic text-muted-foreground">Нажмите, чтобы добавить текст</p>
        ) : (
          <div className={PLAN_TEXT_CLASS} dangerouslySetInnerHTML={{ __html: content }} />
        )}
      </div>
    )
  }

  return (
    <div
      ref={editorWrapRef}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setActive(false)
          if (html !== (content ?? '')) onChangeText(html)
        }
      }}
    >
      <TiptapEditor
        content={html}
        onChange={setHtml}
        minHeight="80px"
        editorClassName="text-sm"
        placeholder="Текст плана — пояснение, раздел, стратегия…"
      />
    </div>
  )
}
