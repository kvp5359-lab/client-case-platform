/**
 * Универсальный редактор слотов для шаблонов.
 *
 * Используется в двух контекстах:
 * 1. Шаблон папки (folder_template_slots) — FolderTemplateDialog
 * 2. Папка внутри набора документов (document_kit_template_folder_slots) — EditKitFolderDialog
 *
 * Полный редактор слота (с AI-промптами) — EditSlotDialog. Здесь только
 * список слотов с drag-n-drop, создание и удаление; клик по строке открывает
 * полный диалог.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { sanitizeHtml } from '@/utils/format/sanitizeHtml'
import {
  Plus,
  FileUp,
  BookOpen,
  HelpCircle,
  Library,
  Sparkles,
  FilePlus2,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useSlotsEditorMutations } from './useSlotsEditorMutations'
import type { Slot, SlotTableConfig } from './useSlotsEditorMutations'
import {
  SlotTemplatePickerDialog,
  type PickedSlotTemplate,
} from './SlotTemplatePickerDialog'
import { EditSlotDialog, type SlotDialogValue } from './EditSlotDialog'
import { knowledgeBaseKeys, knowledgeListKeys } from '@/hooks/queryKeys'
import { getArticlesByWorkspace } from '@/services/api/knowledge/knowledgeBaseService'

export type { SlotTableConfig }

type SlotsEditorProps = {
  config: SlotTableConfig
  description?: string
  /** ID воркспейса — нужен для picker-а из справочника и загрузки статей БЗ. */
  workspaceId?: string
  /**
   * Раскладка слотов: 'wrap' (чипы в строку с переносом, по умолчанию) или
   * 'list' (слоты списком, один под другим).
   */
  layout?: 'wrap' | 'list'
}

export function SlotsEditor({
  config,
  description,
  workspaceId,
  layout = 'wrap',
}: SlotsEditorProps) {
  const isList = layout === 'list'
  const [newSlotName, setNewSlotName] = useState('')
  const [isAddingInline, setIsAddingInline] = useState(false)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null)

  // Drag & drop state
  const [draggedSlotId, setDraggedSlotId] = useState<string | null>(null)
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null)
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after'>('before')

  const { data: slots = [], isLoading } = useQuery({
    queryKey: config.queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(config.table)
        .select('*, slot_template:slot_templates(knowledge_article_id)')
        .eq(config.foreignKey, config.foreignKeyValue)
        .order('sort_order')

      if (error) throw error
      return data as unknown as Slot[]
    },
  })

  // Статьи БЗ — для ArticleTreePicker внутри EditSlotDialog.
  const { data: articles = [] } = useQuery({
    queryKey: knowledgeListKeys.articlesList(workspaceId),
    queryFn: () => getArticlesByWorkspace(workspaceId!),
    enabled: !!workspaceId,
  })

  const { data: groups = [] } = useQuery({
    queryKey: knowledgeBaseKeys.groups(workspaceId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_groups')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data || []
    },
    enabled: !!workspaceId,
  })

  const { data: articleGroups = [] } = useQuery({
    queryKey: knowledgeListKeys.articleGroupLinks(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_article_groups')
        .select('article_id, group_id')
      if (error) throw error
      return data || []
    },
    enabled: !!workspaceId,
  })

  const {
    createMutation,
    createManyMutation,
    updateMutation,
    deleteMutation,
    reorderMutation,
  } = useSlotsEditorMutations(config, slots)

  const handleAddSlot = () => {
    const name = newSlotName.trim()
    if (!name) {
      setIsAddingInline(false)
      return
    }
    createMutation.mutate(name, {
      onSuccess: () => {
        setNewSlotName('')
        setIsAddingInline(false)
      },
    })
  }

  const handlePickFromTemplate = (picked: PickedSlotTemplate[]) => {
    createManyMutation.mutate(picked)
  }

  const handleSaveSlot = (data: SlotDialogValue) => {
    if (!editingSlot) return
    updateMutation.mutate(
      { id: editingSlot.id, ...data },
      { onSuccess: () => setEditingSlot(null) },
    )
  }

  const handleDragStart = (e: React.DragEvent, slotId: string) => {
    setDraggedSlotId(slotId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, slotId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    if (draggedSlotId && draggedSlotId !== slotId) {
      setDragOverSlotId(slotId)
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      if (isList) {
        const y = e.clientY - rect.top
        setDragOverPosition(y < rect.height / 2 ? 'before' : 'after')
      } else {
        const x = e.clientX - rect.left
        setDragOverPosition(x < rect.width / 2 ? 'before' : 'after')
      }
    }
  }

  const handleDragLeave = () => {
    setDragOverSlotId(null)
  }

  const handleDrop = (e: React.DragEvent, targetSlot: Slot) => {
    e.preventDefault()
    setDragOverSlotId(null)

    if (!draggedSlotId || draggedSlotId === targetSlot.id) {
      setDraggedSlotId(null)
      return
    }

    const sorted = [...slots].sort((a, b) => a.sort_order - b.sort_order)
    const draggedIndex = sorted.findIndex((s) => s.id === draggedSlotId)
    const targetIndex = sorted.findIndex((s) => s.id === targetSlot.id)

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedSlotId(null)
      return
    }

    const newOrder = [...sorted]
    const [removed] = newOrder.splice(draggedIndex, 1)
    const adjustedTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex
    const insertIndex = dragOverPosition === 'before' ? adjustedTargetIndex : adjustedTargetIndex + 1
    newOrder.splice(insertIndex, 0, removed)

    const updates = newOrder.map((slot, idx) => ({ id: slot.id, sort_order: idx }))
    reorderMutation.mutate(updates)
    setDraggedSlotId(null)
  }

  const handleDragEnd = () => {
    setDraggedSlotId(null)
    setDragOverSlotId(null)
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4">Загрузка слотов...</div>
  }

  return (
    <div className="space-y-4">
      {description && <p className="text-sm text-muted-foreground">{description}</p>}

      <div className={isList ? 'flex flex-col items-start gap-1.5' : 'flex flex-wrap items-center gap-1.5'}>
        {[...slots]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((slot, idx) => {
            const isDragging = draggedSlotId === slot.id
            const isOver = dragOverSlotId === slot.id
            const hasPrompt = !!(slot.ai_naming_prompt || slot.ai_check_prompt)
            const indicatorClass = isOver
              ? isList
                ? dragOverPosition === 'before'
                  ? 'border-t-2 border-t-blue-500'
                  : 'border-b-2 border-b-blue-500'
                : dragOverPosition === 'before'
                  ? 'border-l-2 border-l-blue-500'
                  : 'border-r-2 border-r-blue-500'
              : ''
            return (
              <div
                key={slot.id}
                role="button"
                tabIndex={0}
                draggable
                onDragStart={(e) => handleDragStart(e, slot.id)}
                onDragOver={(e) => handleDragOver(e, slot.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, slot)}
                onDragEnd={handleDragEnd}
                onClick={() => setEditingSlot(slot)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setEditingSlot(slot)
                  }
                }}
                className={`group/chip relative inline-flex items-center gap-1.5 border border-dashed rounded-full px-2 py-1 cursor-pointer transition-[background-color,border-color,box-shadow] ${indicatorClass} ${
                  isDragging
                    ? 'opacity-40'
                    : isList
                      ? 'border-amber-700/30 hover:border-amber-700/50 hover:bg-amber-50'
                      : 'border-amber-700/30 hover:border-amber-700/50 hover:bg-amber-50 md:hover:z-20 md:hover:-mr-10 md:hover:shadow-md'
                }`}
                title="Редактировать слот"
              >
                {/* Номер по порядку в папке. Считается от отсортированного списка, а не от
                    sort_order: тот после перетаскиваний может идти с дырами. */}
                <span className="text-[10px] font-medium text-amber-700/50 tabular-nums flex-shrink-0">
                  {idx + 1}
                </span>
                <FileUp className="h-3 w-3 text-amber-700/50 flex-shrink-0" />
                <span className="text-xs text-amber-800/70 italic">{slot.name}</span>
                {slot.knowledge_article_id || slot.slot_template?.knowledge_article_id ? (
                  <BookOpen className="h-3 w-3 text-blue-500/70 flex-shrink-0" />
                ) : slot.description ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="p-0 rounded text-blue-500/70 hover:text-blue-500 transition-colors flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <HelpCircle className="h-3 w-3" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="top"
                      className="max-w-[320px] text-xs prose prose-sm prose-slate max-h-[200px] overflow-y-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(slot.description) }} />
                    </PopoverContent>
                  </Popover>
                ) : null}
                {hasPrompt && (
                  <Sparkles
                    className="h-3 w-3 text-amber-500/80 flex-shrink-0"
                    aria-label="Свой AI-промпт"
                  />
                )}
                {/* Эти кнопки появляются на hover ВНУТРИ чипа и удлиняют его на 40px:
                    gap-1.5 родителя (6px) + две кнопки w-4 (по 16px) с gap-0.5 (2px).
                    Ровно на эти 40px чип уходит в минус по margin-right (md:hover:-mr-10
                    выше) — иначе рост сдвигал бы соседние слоты и ронял их на другую
                    строку при каждом движении мыши. Меняешь размер или число кнопок —
                    пересчитай -mr-10. Непрозрачный фон и z-20 у чипа нужны, чтобы
                    наехавший чип перекрывал соседа, а не просвечивал сквозь него.
                    На тач-экранах (<md) hover нет — там кнопки просто всегда видны. */}
                <div className="flex items-center gap-0.5 flex-shrink-0 md:hidden md:group-hover/chip:flex">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center h-4 w-4 text-amber-700/60 hover:text-amber-700"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingSlot(slot)
                    }}
                    title="Редактировать"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center h-4 w-4 text-amber-700/60 hover:text-destructive disabled:opacity-50"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteMutation.mutate(slot.id)
                    }}
                    disabled={deleteMutation.isPending}
                    title="Удалить слот"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )
          })}

        {/* Inline-инпут добавления — стилизован как чип */}
        {isAddingInline && (
          <div className="inline-flex items-center gap-1.5 border border-dashed border-amber-700/50 rounded-full px-2 py-1 bg-amber-50/40">
            <FileUp className="h-3 w-3 text-amber-700/50 flex-shrink-0" />
            <input
              autoFocus
              value={newSlotName}
              onChange={(e) => setNewSlotName(e.target.value)}
              onBlur={handleAddSlot}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddSlot()
                }
                if (e.key === 'Escape') {
                  setNewSlotName('')
                  setIsAddingInline(false)
                }
              }}
              placeholder="Название слота"
              className="text-xs italic bg-transparent outline-none text-amber-800/70 placeholder:text-amber-700/40 min-w-[120px]"
            />
          </div>
        )}

        {/* Круглая кнопка "+" с dropdown — добавить новый или из справочника */}
        {!isAddingInline && (
          workspaceId ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center h-6 w-6 rounded-full border border-dashed border-amber-700/40 text-amber-700/60 hover:border-amber-700/70 hover:text-amber-700 hover:bg-amber-50/40 transition-colors"
                  title="Добавить слот"
                  disabled={createMutation.isPending}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={() => {
                    setNewSlotName('')
                    setIsAddingInline(true)
                  }}
                >
                  <FilePlus2 className="h-3.5 w-3.5 mr-2" />
                  Новый слот
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsPickerOpen(true)}>
                  <Library className="h-3.5 w-3.5 mr-2" />
                  Из справочника
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              type="button"
              onClick={() => {
                setNewSlotName('')
                setIsAddingInline(true)
              }}
              className="inline-flex items-center justify-center h-6 w-6 rounded-full border border-dashed border-amber-700/40 text-amber-700/60 hover:border-amber-700/70 hover:text-amber-700 hover:bg-amber-50/40 transition-colors"
              title="Добавить слот"
              disabled={createMutation.isPending}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )
        )}
      </div>

      <EditSlotDialog
        open={!!editingSlot}
        onOpenChange={(open) => !open && setEditingSlot(null)}
        instanceKey={editingSlot?.id}
        title={editingSlot ? `Слот: ${editingSlot.name}` : undefined}
        value={
          editingSlot
            ? {
                name: editingSlot.name,
                description: editingSlot.description,
                knowledge_article_id: editingSlot.knowledge_article_id,
                ai_naming_prompt: editingSlot.ai_naming_prompt,
                ai_check_prompt: editingSlot.ai_check_prompt,
              }
            : null
        }
        isPending={updateMutation.isPending}
        articles={articles}
        groups={groups}
        articleGroups={articleGroups}
        onSubmit={handleSaveSlot}
      />

      {workspaceId && (
        <SlotTemplatePickerDialog
          open={isPickerOpen}
          onOpenChange={setIsPickerOpen}
          workspaceId={workspaceId}
          existingNames={slots.map((s) => s.name)}
          articles={articles}
          groups={groups}
          articleGroups={articleGroups}
          onPick={handlePickFromTemplate}
        />
      )}
    </div>
  )
}
