/**
 * Хук для drag & drop секций
 */

import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useFormTemplateContext } from '../context/FormTemplateContext'
import { FormSectionWithDetails } from '../types'

export function useSectionDragDrop(
  templateId: string | undefined,
  sections: FormSectionWithDetails[],
) {
  const { state, dispatch } = useFormTemplateContext()
  const queryClient = useQueryClient()

  // Начало перетаскивания секции
  const handleSectionDragStart = (e: React.DragEvent, sectionFormId: string) => {
    dispatch({ type: 'SET_DRAGGED_SECTION_FORM_ID', payload: sectionFormId })
    e.dataTransfer.effectAllowed = 'move'
  }

  // Перетаскивание над секцией
  const handleSectionDragOver = (e: React.DragEvent, sectionFormId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    if (state.draggedSectionFormId && state.draggedSectionFormId !== sectionFormId) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const y = e.clientY - rect.top
      const height = rect.height
      const position = y < height / 2 ? 'top' : 'bottom'

      dispatch({
        type: 'SET_DRAG_OVER_SECTION_FORM',
        payload: { sectionFormId, position },
      })
    }
  }

  // Выход за пределы секции
  const handleSectionDragLeave = () => {
    dispatch({
      type: 'SET_DRAG_OVER_SECTION_FORM',
      payload: { sectionFormId: null, position: 'top' },
    })
  }

  // Drop секции
  const handleSectionDrop = async (e: React.DragEvent, targetSection: FormSectionWithDetails) => {
    e.preventDefault()
    dispatch({
      type: 'SET_DRAG_OVER_SECTION_FORM',
      payload: { sectionFormId: null, position: 'top' },
    })

    if (!state.draggedSectionFormId || state.draggedSectionFormId === targetSection.id) {
      dispatch({ type: 'RESET_SECTION_DRAG_STATE' })
      return
    }

    const draggedSection = sections.find((s) => s.id === state.draggedSectionFormId)
    if (!draggedSection) {
      dispatch({ type: 'RESET_SECTION_DRAG_STATE' })
      return
    }

    // Z5-32: try/catch для async drag&drop
    try {
      const allSectionsSorted = [...sections].sort((a, b) => a.sort_order - b.sort_order)
      const draggedIndex = allSectionsSorted.findIndex((s) => s.id === state.draggedSectionFormId)
      const targetIndex = allSectionsSorted.findIndex((s) => s.id === targetSection.id)

      if (draggedIndex === -1 || targetIndex === -1) return

      const newOrder = [...allSectionsSorted]
      const [removed] = newOrder.splice(draggedIndex, 1)

      const adjustedTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex
      const insertIndex =
        state.sectionDragOverPosition === 'top' ? adjustedTargetIndex : adjustedTargetIndex + 1

      newOrder.splice(insertIndex, 0, removed)

      await Promise.all(
        newOrder.map((s, i) =>
          supabase.from('form_template_sections').update({ sort_order: i }).eq('id', s.id),
        ),
      )

      queryClient.invalidateQueries({ queryKey: ['form-template-sections', templateId] })
    } catch {
      toast.error('Ошибка при перемещении секции')
    } finally {
      dispatch({ type: 'RESET_SECTION_DRAG_STATE' })
    }
  }

  // Завершение перетаскивания
  const handleSectionDragEnd = () => {
    dispatch({ type: 'RESET_SECTION_DRAG_STATE' })
  }

  return {
    draggedSectionFormId: state.draggedSectionFormId,
    dragOverSectionFormId: state.dragOverSectionFormId,
    sectionDragOverPosition: state.sectionDragOverPosition,
    handleSectionDragStart,
    handleSectionDragOver,
    handleSectionDragLeave,
    handleSectionDrop,
    handleSectionDragEnd,
  }
}
