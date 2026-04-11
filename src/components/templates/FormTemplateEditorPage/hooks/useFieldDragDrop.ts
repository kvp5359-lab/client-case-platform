/**
 * Хук для drag & drop полей
 */

import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { formTemplateKeys } from '@/hooks/queryKeys'
import { useFormTemplateContext } from '../context/FormTemplateContext'
import { FormFieldWithDefinition } from '../types'

export function useFieldDragDrop(
  templateId: string | undefined,
  fields: FormFieldWithDefinition[],
) {
  const { state, dispatch } = useFormTemplateContext()
  const queryClient = useQueryClient()

  // Начало перетаскивания
  const handleDragStart = (e: React.DragEvent, fieldId: string) => {
    dispatch({ type: 'SET_DRAGGED_FIELD_ID', payload: fieldId })
    e.dataTransfer.effectAllowed = 'move'
  }

  // Перетаскивание над полем
  const handleDragOver = (e: React.DragEvent, fieldId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    if (state.draggedFieldId && state.draggedFieldId !== fieldId) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const y = e.clientY - rect.top
      const height = rect.height
      const position = y < height / 2 ? 'top' : 'bottom'

      dispatch({
        type: 'SET_DRAG_OVER_FIELD',
        payload: { fieldId, position },
      })
    }
  }

  // Выход за пределы поля
  const handleDragLeave = () => {
    dispatch({ type: 'SET_DRAG_OVER_FIELD', payload: { fieldId: null, position: 'top' } })
  }

  // Drop на поле
  const handleDrop = async (e: React.DragEvent, targetField: FormFieldWithDefinition) => {
    e.preventDefault()
    dispatch({ type: 'SET_DRAG_OVER_FIELD', payload: { fieldId: null, position: 'top' } })

    if (!state.draggedFieldId || state.draggedFieldId === targetField.id) {
      dispatch({ type: 'RESET_FIELD_DRAG_STATE' })
      return
    }

    const draggedField = fields.find((f) => f.id === state.draggedFieldId)
    if (!draggedField) {
      dispatch({ type: 'RESET_FIELD_DRAG_STATE' })
      return
    }

    // Z5-32: try/catch для async drag&drop
    try {
      const allFieldsSorted = [...fields].sort((a, b) => a.sort_order - b.sort_order)
      const draggedIndex = allFieldsSorted.findIndex((f) => f.id === state.draggedFieldId)
      const targetIndex = allFieldsSorted.findIndex((f) => f.id === targetField.id)

      if (draggedIndex === -1 || targetIndex === -1) {
        dispatch({ type: 'RESET_FIELD_DRAG_STATE' })
        return
      }

      const targetSectionId = targetField.form_template_section_id
      const needsSectionUpdate = draggedField.form_template_section_id !== targetSectionId

      if (needsSectionUpdate) {
        await supabase
          .from('form_template_fields')
          .update({ form_template_section_id: targetSectionId })
          .eq('id', state.draggedFieldId)
      }

      const newOrder = [...allFieldsSorted]
      const [removed] = newOrder.splice(draggedIndex, 1)

      const adjustedTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex
      const insertIndex =
        state.dragOverPosition === 'top' ? adjustedTargetIndex : adjustedTargetIndex + 1

      newOrder.splice(insertIndex, 0, removed)

      // Z5-15: отправляем только записи с изменившимся sort_order
      const changed = newOrder.filter((f, i) => f.sort_order !== i)
      if (changed.length > 0) {
        await Promise.all(
          changed.map((f) => {
            const newIndex = newOrder.indexOf(f)
            return supabase
              .from('form_template_fields')
              .update({ sort_order: newIndex })
              .eq('id', f.id)
          }),
        )
      }

      queryClient.invalidateQueries({ queryKey: formTemplateKeys.fields(templateId) })
    } catch {
      toast.error('Ошибка при перемещении поля')
    } finally {
      dispatch({ type: 'RESET_FIELD_DRAG_STATE' })
    }
  }

  // Завершение перетаскивания
  const handleDragEnd = () => {
    dispatch({ type: 'RESET_FIELD_DRAG_STATE' })
  }

  // Перетаскивание над секцией (для пустых секций)
  const handleSectionDragOver = (e: React.DragEvent, sectionId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (state.draggedFieldId) {
      dispatch({ type: 'SET_DRAG_OVER_SECTION_ID', payload: sectionId })
    }
  }

  const handleSectionDragLeave = () => {
    dispatch({ type: 'SET_DRAG_OVER_SECTION_ID', payload: null })
  }

  // Drop в пустую секцию
  const handleSectionDrop = async (e: React.DragEvent, targetSectionId: string) => {
    e.preventDefault()
    dispatch({ type: 'SET_DRAG_OVER_SECTION_ID', payload: null })

    if (!state.draggedFieldId) return

    const draggedField = fields.find((f) => f.id === state.draggedFieldId)
    if (!draggedField) {
      dispatch({ type: 'RESET_FIELD_DRAG_STATE' })
      return
    }

    const fieldsInTargetSection = fields.filter(
      (f) => f.form_template_section_id === targetSectionId,
    )
    const maxOrder =
      fieldsInTargetSection.length > 0
        ? Math.max(...fieldsInTargetSection.map((f) => f.sort_order))
        : -1

    try {
      const { error } = await supabase
        .from('form_template_fields')
        .update({
          form_template_section_id: targetSectionId === 'no-section' ? null : targetSectionId,
          sort_order: maxOrder + 1,
        })
        .eq('id', state.draggedFieldId)

      if (error) throw error
    } catch (err) {
      logger.error('Failed to move field:', err)
    } finally {
      queryClient.invalidateQueries({ queryKey: formTemplateKeys.fields(templateId) })
      dispatch({ type: 'RESET_FIELD_DRAG_STATE' })
    }
  }

  return {
    draggedFieldId: state.draggedFieldId,
    dragOverFieldId: state.dragOverFieldId,
    dragOverPosition: state.dragOverPosition,
    dragOverSectionId: state.dragOverSectionId,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    handleSectionDragOver,
    handleSectionDragLeave,
    handleSectionDrop,
  }
}
