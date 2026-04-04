/**
 * Универсальный редактор слотов для шаблонов.
 *
 * Используется в двух контекстах:
 * 1. Шаблон папки (folder_template_slots) — FolderTemplateDialog
 * 2. Папка внутри набора документов (document_kit_template_folder_slots) — EditKitFolderDialog
 */

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Trash2, GripVertical, HelpCircle } from 'lucide-react'
import { TiptapEditor } from '@/components/tiptap-editor/tiptap-editor'
import { useSlotsEditorMutations } from './useSlotsEditorMutations'
import type { Slot, SlotTableConfig } from './useSlotsEditorMutations'

export type { SlotTableConfig }

interface SlotsEditorProps {
  config: SlotTableConfig
  description?: string
}

export function SlotsEditor({ config, description }: SlotsEditorProps) {
  const [newSlotName, setNewSlotName] = useState('')
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  // Description dialog state
  const [descDialogSlot, setDescDialogSlot] = useState<Slot | null>(null)
  const [descContent, setDescContent] = useState('')

  // Drag & drop state
  const [draggedSlotId, setDraggedSlotId] = useState<string | null>(null)
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null)
  const [dragOverPosition, setDragOverPosition] = useState<'top' | 'bottom'>('top')

  const { data: slots = [], isLoading } = useQuery({
    queryKey: config.queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(config.table)
        .select('*')
        .eq(config.foreignKey, config.foreignKeyValue)
        .order('sort_order')

      if (error) throw error
      return data as Slot[]
    },
  })

  const {
    createMutation,
    renameMutation,
    updateDescriptionMutation,
    deleteMutation,
    reorderMutation,
  } = useSlotsEditorMutations(config, slots)

  const handleAddSlot = () => {
    const name = newSlotName.trim()
    if (!name) return
    createMutation.mutate(name, { onSuccess: () => setNewSlotName('') })
  }

  const handleStartEdit = (slotId: string, currentName: string) => {
    setEditingSlotId(slotId)
    setEditingName(currentName)
  }

  const handleSaveEdit = () => {
    if (!editingSlotId || !editingName.trim()) return
    renameMutation.mutate(
      { id: editingSlotId, name: editingName.trim() },
      { onSuccess: () => setEditingSlotId(null) },
    )
  }

  const handleCancelEdit = () => {
    setEditingSlotId(null)
    setEditingName('')
  }

  const handleOpenDescDialog = useCallback((slot: Slot) => {
    setDescDialogSlot(slot)
    setDescContent(slot.description || '')
  }, [])

  const handleSaveDesc = useCallback(() => {
    if (!descDialogSlot) return
    // Tiptap returns "<p></p>" for empty content
    const isEmpty = !descContent || descContent === '<p></p>' || descContent.trim() === ''
    const newDesc = isEmpty ? null : descContent
    if (newDesc !== (descDialogSlot.description || null)) {
      updateDescriptionMutation.mutate(
        { id: descDialogSlot.id, description: newDesc },
        { onSuccess: () => setDescDialogSlot(null) },
      )
    } else {
      setDescDialogSlot(null)
    }
  }, [descDialogSlot, descContent, updateDescriptionMutation])

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
      const y = e.clientY - rect.top
      setDragOverPosition(y < rect.height / 2 ? 'top' : 'bottom')
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
    const insertIndex = dragOverPosition === 'top' ? adjustedTargetIndex : adjustedTargetIndex + 1
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

      {slots.length > 0 && (
        <div className="space-y-1">
          {[...slots]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((slot, index) => {
              const isDragging = draggedSlotId === slot.id
              const isOver = dragOverSlotId === slot.id
              return (
                <div
                  key={slot.id}
                  className={`flex items-center gap-2 group py-1.5 px-2 rounded-md transition-colors ${
                    isDragging
                      ? 'opacity-40 bg-blue-50'
                      : isOver
                        ? dragOverPosition === 'top'
                          ? 'bg-blue-100 border-t-2 border-t-blue-500'
                          : 'bg-blue-100 border-b-2 border-b-blue-500'
                        : 'hover:bg-muted/50'
                  }`}
                  draggable={editingSlotId !== slot.id}
                  onDragStart={(e) => handleDragStart(e, slot.id)}
                  onDragOver={(e) => handleDragOver(e, slot.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, slot)}
                  onDragEnd={handleDragEnd}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 flex-shrink-0 cursor-grab active:cursor-grabbing" />
                  <span className="text-sm text-muted-foreground w-5 text-right flex-shrink-0">
                    {index + 1}.
                  </span>
                  {editingSlotId === slot.id ? (
                    <Input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={handleSaveEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit()
                        if (e.key === 'Escape') handleCancelEdit()
                      }}
                      className="h-7 text-sm flex-1"
                    />
                  ) : (
                    <button
                      type="button"
                      className="text-sm flex-1 cursor-pointer hover:underline text-left bg-transparent border-none p-0"
                      onClick={() => handleStartEdit(slot.id, slot.name)}
                    >
                      {slot.name}
                    </button>
                  )}
                  {/* Описание слота — иконка ? открывает диалог с Tiptap */}
                  <button
                    type="button"
                    className={`p-0.5 rounded transition-opacity flex-shrink-0 ${
                      slot.description
                        ? 'text-blue-500 opacity-70 hover:opacity-100'
                        : 'text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-muted-foreground/60'
                    }`}
                    title={slot.description ? 'Редактировать описание' : 'Добавить описание'}
                    onClick={() => handleOpenDescDialog(slot)}
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(slot.id)}
                    disabled={deleteMutation.isPending}
                    title="Удалить слот"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            })}
        </div>
      )}

      {slots.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">
          Нет слотов. Добавьте первый слот ниже.
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={newSlotName}
          onChange={(e) => setNewSlotName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAddSlot()
            }
          }}
          placeholder="Название нового слота"
          className="flex-1 h-8 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1"
          onClick={handleAddSlot}
          disabled={!newSlotName.trim() || createMutation.isPending}
        >
          <Plus className="h-3.5 w-3.5" />
          Добавить
        </Button>
      </div>

      {/* Диалог редактирования описания слота */}
      <Dialog open={!!descDialogSlot} onOpenChange={(open) => !open && setDescDialogSlot(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Описание слота: {descDialogSlot?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <TiptapEditor
              content={descContent}
              onChange={setDescContent}
              placeholder="Опишите, какой документ ожидается в этом слоте..."
              minHeight="150px"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDescDialogSlot(null)}>
              Отмена
            </Button>
            <Button onClick={handleSaveDesc} disabled={updateDescriptionMutation.isPending}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
