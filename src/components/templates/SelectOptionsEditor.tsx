/**
 * SelectOptionsEditor — компонент для управления значениями выпадающего списка
 * Позволяет добавлять, удалять, переупорядочивать значения и назначать им цвета
 */

import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { Database } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { OptionItem, PRESET_COLORS } from './SelectOptionItem'
import { fieldDefinitionKeys } from '@/hooks/queryKeys'

type SelectOption = Database['public']['Tables']['field_definition_select_options']['Row']

interface SelectOptionsEditorProps {
  fieldId: string
  onChangesDetected?: (hasChanges: boolean) => void
}

export function SelectOptionsEditor({ fieldId, onChangesDetected }: SelectOptionsEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const { data: options = [], isLoading } = useQuery({
    queryKey: fieldDefinitionKeys.selectOptions(fieldId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('field_definition_select_options')
        .select('*')
        .eq('field_definition_id', fieldId)
        .order('order_index', { ascending: true })

      if (error) throw error
      return data as SelectOption[]
    },
    enabled: !!fieldId,
  })

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: fieldDefinitionKeys.selectOptions(fieldId) })

  const addOptionMutation = useMutation({
    mutationFn: async () => {
      const maxOrder = options.length > 0 ? Math.max(...options.map((o) => o.order_index)) : -1
      const nextColor = PRESET_COLORS[options.length % PRESET_COLORS.length]

      const { data, error } = await supabase
        .from('field_definition_select_options')
        .insert({
          field_definition_id: fieldId,
          label: '',
          value: '',
          color: nextColor,
          order_index: maxOrder + 1,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (newOption) => {
      invalidate()
      setEditingId(newOption.id)
      setEditingLabel('')
      onChangesDetected?.(false)
    },
    onError: () => toast.error('Не удалось добавить значение'),
  })

  const updateLabelMutation = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const generatedValue = label
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_а-яё]/gi, '')

      const { error } = await supabase
        .from('field_definition_select_options')
        .update({ label: label.trim(), value: generatedValue || label.trim() })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      setEditingId(null)
      setEditingLabel('')
      onChangesDetected?.(false)
    },
    onError: () => toast.error('Не удалось обновить значение'),
  })

  const deleteOptionMutation = useMutation({
    mutationFn: async (optionId: string) => {
      const { error } = await supabase
        .from('field_definition_select_options')
        .delete()
        .eq('id', optionId)

      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      onChangesDetected?.(false)
    },
    onError: () => toast.error('Не удалось удалить значение'),
  })

  const updateOrderMutation = useMutation({
    mutationFn: async (updates: Array<{ id: string; order_index: number }>) => {
      try {
        await Promise.all(
          updates.map(({ id, order_index }) =>
            supabase.from('field_definition_select_options').update({ order_index }).eq('id', id),
          ),
        )
      } catch (error) {
        logger.error('Ошибка обновления порядка значений:', error)
        throw error
      }
    },
    onSuccess: () => {
      invalidate()
      onChangesDetected?.(false)
    },
    onError: () => toast.error('Не удалось обновить порядок'),
  })

  const updateColorMutation = useMutation({
    mutationFn: async ({ id, color }: { id: string; color: string }) => {
      const { error } = await supabase
        .from('field_definition_select_options')
        .update({ color })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      onChangesDetected?.(false)
    },
    onError: () => toast.error('Не удалось обновить цвет'),
  })

  const handleStartEdit = (option: SelectOption) => {
    setEditingId(option.id)
    setEditingLabel(option.label)
  }

  const handleSaveEdit = (optionId: string) => {
    if (editingLabel.trim()) {
      updateLabelMutation.mutate({ id: optionId, label: editingLabel })
    } else {
      deleteOptionMutation.mutate(optionId)
      setEditingId(null)
      setEditingLabel('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, optionId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveEdit(optionId)
    } else if (e.key === 'Escape') {
      setEditingId(null)
      setEditingLabel('')
    }
  }

  const handleDragStart = (e: React.DragEvent, optionId: string) => {
    setDraggedItemId(optionId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, optionId: string) => {
    e.preventDefault()
    if (draggedItemId && draggedItemId !== optionId) {
      setDragOverItemId(optionId)
    }
  }

  const handleDragEnd = () => {
    if (!draggedItemId || !dragOverItemId) {
      setDraggedItemId(null)
      setDragOverItemId(null)
      return
    }

    const draggedIndex = options.findIndex((o) => o.id === draggedItemId)
    const targetIndex = options.findIndex((o) => o.id === dragOverItemId)

    if (draggedIndex === -1 || targetIndex === -1) return

    const newOptions = [...options]
    const [draggedItem] = newOptions.splice(draggedIndex, 1)
    newOptions.splice(targetIndex, 0, draggedItem)

    updateOrderMutation.mutate(
      newOptions.map((option, index) => ({ id: option.id, order_index: index })),
    )

    setDraggedItemId(null)
    setDragOverItemId(null)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-muted-foreground">Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {options.map((option) => (
          <OptionItem
            key={option.id}
            option={option}
            isEditing={editingId === option.id}
            editingLabel={editingLabel}
            isDragged={draggedItemId === option.id}
            isDragOver={dragOverItemId === option.id}
            inputRef={inputRef}
            onLabelChange={setEditingLabel}
            onStartEdit={handleStartEdit}
            onSaveEdit={handleSaveEdit}
            onKeyDown={handleKeyDown}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onColorSelect={(id, color) => updateColorMutation.mutate({ id, color })}
            onDelete={(id) => deleteOptionMutation.mutate(id)}
            isDeletePending={deleteOptionMutation.isPending}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => addOptionMutation.mutate()}
        disabled={addOptionMutation.isPending}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Добавить значение
      </Button>
    </div>
  )
}
