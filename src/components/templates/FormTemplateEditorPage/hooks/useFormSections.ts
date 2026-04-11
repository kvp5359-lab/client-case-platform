/**
 * Хук для работы с секциями шаблона анкеты
 * Секции хранятся inline в form_template_sections (name, description)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { formTemplateKeys } from '@/hooks/queryKeys'
import { FormSectionWithDetails } from '../types'

export function useFormSections(templateId: string | undefined) {
  const queryClient = useQueryClient()

  // Загрузка секций шаблона (name и description прямо в таблице)
  const sectionsQuery = useQuery({
    queryKey: formTemplateKeys.sections(templateId),
    queryFn: async () => {
      if (!templateId) return []

      try {
        const { data: sections, error } = await supabase
          .from('form_template_sections')
          .select('*')
          .eq('form_template_id', templateId)
          .order('sort_order', { ascending: true })

        if (error) throw error

        // Z5-04: один запрос вместо N+1 для подсчёта полей по секциям
        const { data: allFields } = await supabase
          .from('form_template_fields')
          .select('form_template_section_id')
          .eq('form_template_id', templateId)

        const countMap = new Map<string, number>()
        allFields?.forEach((f) => {
          const key = f.form_template_section_id || ''
          countMap.set(key, (countMap.get(key) || 0) + 1)
        })

        const sectionsWithCounts: FormSectionWithDetails[] = (sections || []).map((section) => ({
          ...section,
          fields_count: countMap.get(section.id) || 0,
        }))

        return sectionsWithCounts
      } catch (error) {
        logger.error('Ошибка загрузки секций шаблона:', error)
        throw error
      }
    },
    enabled: !!templateId,
  })

  // Создание новой секции inline
  const createSectionMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      if (!templateId) return

      const sections = sectionsQuery.data || []
      const maxOrder = sections.length > 0 ? Math.max(...sections.map((s) => s.sort_order)) : -1

      const { error } = await supabase.from('form_template_sections').insert({
        form_template_id: templateId,
        name,
        description: description || null,
        sort_order: maxOrder + 1,
      })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: formTemplateKeys.sections(templateId) })
    },
  })

  // Обновление секции (имя и/или описание)
  const updateSectionMutation = useMutation({
    mutationFn: async ({
      sectionId,
      name,
      description,
    }: {
      sectionId: string
      name: string
      description?: string
    }) => {
      const { error } = await supabase
        .from('form_template_sections')
        .update({ name, description: description || null })
        .eq('id', sectionId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: formTemplateKeys.sections(templateId) })
    },
  })

  // Удаление секции
  const removeSectionMutation = useMutation({
    mutationFn: async (formSectionId: string) => {
      const { error } = await supabase
        .from('form_template_sections')
        .delete()
        .eq('id', formSectionId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: formTemplateKeys.sections(templateId) })
    },
  })

  // Изменение порядка секций (стрелками)
  const reorderSectionMutation = useMutation({
    mutationFn: async ({
      sectionId,
      direction,
    }: {
      sectionId: string
      direction: 'up' | 'down'
    }) => {
      const sections = sectionsQuery.data || []
      const currentIndex = sections.findIndex((s) => s.id === sectionId)
      if (currentIndex === -1) return

      const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (swapIndex < 0 || swapIndex >= sections.length) return

      const currentSection = sections[currentIndex]
      const swapSection = sections[swapIndex]

      const [res1, res2] = await Promise.all([
        supabase
          .from('form_template_sections')
          .update({ sort_order: swapSection.sort_order })
          .eq('id', currentSection.id),
        supabase
          .from('form_template_sections')
          .update({ sort_order: currentSection.sort_order })
          .eq('id', swapSection.id),
      ])
      if (res1.error) throw res1.error
      if (res2.error) throw res2.error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: formTemplateKeys.sections(templateId) })
    },
  })

  // Перетаскивание секций (drag & drop)
  const moveSectionByDragMutation = useMutation({
    mutationFn: async ({
      draggedSectionId,
      targetSectionId,
      position,
    }: {
      draggedSectionId: string
      targetSectionId: string
      position: 'top' | 'bottom'
    }) => {
      const sections = sectionsQuery.data || []
      const allSectionsSorted = [...sections].sort((a, b) => a.sort_order - b.sort_order)

      const draggedIndex = allSectionsSorted.findIndex((s) => s.id === draggedSectionId)
      const targetIndex = allSectionsSorted.findIndex((s) => s.id === targetSectionId)

      if (draggedIndex === -1 || targetIndex === -1) return

      const newOrder = [...allSectionsSorted]
      const [removed] = newOrder.splice(draggedIndex, 1)

      const adjustedTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex
      const insertIndex = position === 'top' ? adjustedTargetIndex : adjustedTargetIndex + 1

      newOrder.splice(insertIndex, 0, removed)

      // Z5-05: Promise.all вместо последовательных await
      await Promise.all(
        newOrder.map((s, i) =>
          supabase.from('form_template_sections').update({ sort_order: i }).eq('id', s.id),
        ),
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: formTemplateKeys.sections(templateId) })
    },
  })

  return {
    sections: sectionsQuery.data || [],
    isLoading: sectionsQuery.isLoading,
    createSection: createSectionMutation.mutate,
    isCreatingSection: createSectionMutation.isPending,
    updateSection: updateSectionMutation.mutate,
    removeSection: removeSectionMutation.mutate,
    reorderSection: reorderSectionMutation.mutate,
    moveSectionByDrag: moveSectionByDragMutation.mutate,
  }
}
