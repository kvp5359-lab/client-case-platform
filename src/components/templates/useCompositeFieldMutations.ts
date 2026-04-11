/**
 * useCompositeFieldMutations — queries, мутации и D&D для вложенных полей составного поля
 *
 * Вынесено из CompositeFieldEditor.tsx (Z5-54)
 */

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { FieldDefinition } from '@/types/formKit'
import { Database } from '@/types/database'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { FIELD_TYPE_LABELS } from './field-definition/constants'
import { fieldDefinitionKeys } from '@/hooks/queryKeys'

export { FIELD_TYPE_LABELS }

type CompositeItem = Database['public']['Tables']['field_definition_composite_items']['Row'] & {
  nested_field: FieldDefinition
}

export type { CompositeItem }

export function useCompositeFieldMutations(
  fieldId: string,
  onChangesDetected?: (hasChanges: boolean) => void,
) {
  const queryClient = useQueryClient()
  const itemsQueryKey = ['field-definition-composite-items', fieldId]

  // D&D state
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null)
  const [dragOverPosition, setDragOverPosition] = useState<'top' | 'bottom'>('top')

  // --- Queries ---

  const { data: compositeItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: itemsQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('field_definition_composite_items')
        .select(
          `
          *,
          nested_field:field_definitions!nested_field_id(*)
        `,
        )
        .eq('composite_field_id', fieldId)
        .order('order_index', { ascending: true })

      if (error) throw error
      return data as CompositeItem[]
    },
    enabled: !!fieldId,
  })

  const { data: availableFields = [] } = useQuery({
    queryKey: fieldDefinitionKeys.forComposite(fieldId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('field_definitions')
        .select('*')
        .neq('field_type', 'composite')
        .neq('id', fieldId)
        .order('name')

      if (error) throw error
      return data as FieldDefinition[]
    },
    enabled: !!fieldId,
  })

  // Фильтрация уже добавленных
  const addedFieldIds = compositeItems.map((item) => item.nested_field_id)
  const filteredFields = availableFields.filter((f) => !addedFieldIds.includes(f.id))

  // --- Mutations ---

  const addFieldMutation = useMutation({
    mutationFn: async (nestedFieldId: string) => {
      const maxOrder =
        compositeItems.length > 0 ? Math.max(...compositeItems.map((item) => item.order_index)) : -1

      const { error } = await supabase.from('field_definition_composite_items').insert({
        composite_field_id: fieldId,
        nested_field_id: nestedFieldId,
        order_index: maxOrder + 1,
      })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: itemsQueryKey })
      onChangesDetected?.(true)
    },
    onError: (error) => {
      logger.error('Ошибка добавления вложенного поля:', error)
      toast.error('Не удалось добавить поле')
    },
  })

  const removeFieldMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('field_definition_composite_items')
        .delete()
        .eq('id', itemId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: itemsQueryKey })
      onChangesDetected?.(true)
    },
    onError: (error) => {
      logger.error('Ошибка удаления вложенного поля:', error)
      toast.error('Не удалось удалить поле')
    },
  })

  const reorderMutation = useMutation({
    mutationFn: async (updates: Array<{ id: string; order_index: number }>) => {
      const results = await Promise.all(
        updates.map((update) =>
          supabase
            .from('field_definition_composite_items')
            .update({ order_index: update.order_index })
            .eq('id', update.id),
        ),
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: itemsQueryKey })
      onChangesDetected?.(true)
    },
    onError: (error) => {
      logger.error('Failed to reorder composite items:', error)
      toast.error('Не удалось обновить порядок')
      queryClient.invalidateQueries({ queryKey: itemsQueryKey })
    },
  })

  // --- Search filtering ---

  const getSearchFiltered = useMemo(
    () => (searchQuery: string) =>
      filteredFields.filter(
        (field) =>
          field.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          FIELD_TYPE_LABELS[field.field_type].toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [filteredFields],
  )

  // --- D&D handlers ---

  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    setDraggedItemId(itemId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, itemId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedItemId === itemId) return

    setDragOverItemId(itemId)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2
    setDragOverPosition(e.clientY < midpoint ? 'top' : 'bottom')
  }

  const handleDragLeave = () => {
    setDragOverItemId(null)
  }

  const handleDrop = async (e: React.DragEvent, targetItem: CompositeItem) => {
    e.preventDefault()
    setDragOverItemId(null)

    if (!draggedItemId || draggedItemId === targetItem.id) {
      setDraggedItemId(null)
      return
    }

    const draggedItem = compositeItems.find((item) => item.id === draggedItemId)
    if (!draggedItem) {
      setDraggedItemId(null)
      return
    }

    const allItemsSorted = [...compositeItems].sort((a, b) => a.order_index - b.order_index)
    const draggedIndex = allItemsSorted.findIndex((item) => item.id === draggedItemId)
    const targetIndex = allItemsSorted.findIndex((item) => item.id === targetItem.id)

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedItemId(null)
      return
    }

    const newOrder = [...allItemsSorted]
    const [removed] = newOrder.splice(draggedIndex, 1)
    const adjustedTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex
    const insertIndex = dragOverPosition === 'top' ? adjustedTargetIndex : adjustedTargetIndex + 1
    newOrder.splice(insertIndex, 0, removed)

    const updates = newOrder.map((item, idx) => ({ id: item.id, order_index: idx }))
    await reorderMutation.mutateAsync(updates)
    setDraggedItemId(null)
  }

  const handleDragEnd = () => {
    setDraggedItemId(null)
    setDragOverItemId(null)
  }

  return {
    compositeItems,
    itemsLoading,
    filteredFields,
    getSearchFiltered,
    addFieldMutation,
    removeFieldMutation,
    // D&D
    draggedItemId,
    dragOverItemId,
    dragOverPosition,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  }
}
