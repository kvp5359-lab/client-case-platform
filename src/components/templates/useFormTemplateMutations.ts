/**
 * useFormTemplateMutations — query + мутации + D&D для шаблонов анкет
 *
 * Вынесено из FormTemplatesContent.tsx
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import { Database } from '@/types/database'

type FormTemplate = Database['public']['Tables']['form_templates']['Row']

interface FormTemplateWithCount extends FormTemplate {
  fields_count: number
}

export function useFormTemplateMutations(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const queryKey = ['form-templates', workspaceId]

  // --- D&D state ---
  const [draggedTemplateId, setDraggedTemplateId] = useState<string | null>(null)
  const [dragOverTemplateId, setDragOverTemplateId] = useState<string | null>(null)
  const [dragOverPosition, setDragOverPosition] = useState<'top' | 'bottom'>('bottom')

  // --- Query ---
  const { data: templates = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!workspaceId) return []

      try {
        const { data: formTemplates, error } = await supabase
          .from('form_templates')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('order_index', { ascending: true })

        if (error) throw error

        const templateIds = (formTemplates || []).map((t) => t.id)
        if (templateIds.length === 0) return []

        const { data: allFields } = await supabase
          .from('form_template_fields')
          .select('form_template_id')
          .in('form_template_id', templateIds)

        const countMap = new Map<string, number>()
        allFields?.forEach((f) => {
          countMap.set(f.form_template_id, (countMap.get(f.form_template_id) || 0) + 1)
        })

        return (formTemplates || []).map(
          (template): FormTemplateWithCount => ({
            ...template,
            fields_count: countMap.get(template.id) || 0,
          }),
        )
      } catch (error) {
        logger.error('Ошибка загрузки шаблонов анкет:', error)
        throw error
      }
    },
    enabled: !!workspaceId,
  })

  // --- Mutations ---

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const { error } = await supabase.from('form_templates').insert({
        workspace_id: workspaceId ?? '',
        name: data.name,
        description: data.description || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      toast.success('Шаблон анкеты создан')
    },
    onError: () => {
      toast.error('Не удалось создать шаблон анкеты')
    },
  })

  const copyMutation = useMutation({
    mutationFn: async (template: FormTemplate) => {
      // B-77: атомарное копирование через RPC
      const { error } = await supabase.rpc('copy_form_template', {
        p_source_template_id: template.id,
        p_workspace_id: workspaceId ?? '',
        p_new_name: `${template.name} (копия)`,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      toast.success('Шаблон анкеты скопирован')
    },
    onError: () => {
      toast.error('Не удалось скопировать шаблон анкеты')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('form_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      toast.success('Шаблон анкеты удалён')
    },
    onError: () => {
      toast.error('Не удалось удалить шаблон анкеты')
    },
  })

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; order_index: number }[]) => {
      const results = await Promise.all(
        updates.map((update) =>
          supabase
            .from('form_templates')
            .update({ order_index: update.order_index })
            .eq('id', update.id),
        ),
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
    onError: () => {
      toast.error('Не удалось изменить порядок шаблонов')
    },
  })

  // --- D&D handlers ---

  const handleDragStart = (e: React.DragEvent, templateId: string) => {
    setDraggedTemplateId(templateId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, templateId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverTemplateId(templateId)

    const rect = e.currentTarget.getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2
    setDragOverPosition(e.clientY < midpoint ? 'top' : 'bottom')
  }

  const handleDragLeave = () => {
    setDragOverTemplateId(null)
  }

  const handleDrop = async (e: React.DragEvent, targetTemplate: FormTemplateWithCount) => {
    e.preventDefault()
    setDragOverTemplateId(null)

    if (!draggedTemplateId || draggedTemplateId === targetTemplate.id) {
      setDraggedTemplateId(null)
      return
    }

    const draggedTemplate = templates.find((t) => t.id === draggedTemplateId)
    if (!draggedTemplate) {
      setDraggedTemplateId(null)
      return
    }

    const allTemplatesSorted = [...templates].sort((a, b) => a.order_index - b.order_index)
    const draggedIndex = allTemplatesSorted.findIndex((t) => t.id === draggedTemplateId)
    const targetIndex = allTemplatesSorted.findIndex((t) => t.id === targetTemplate.id)

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedTemplateId(null)
      return
    }

    const newOrder = [...allTemplatesSorted]
    const [removed] = newOrder.splice(draggedIndex, 1)

    const adjustedTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex
    const insertIndex = dragOverPosition === 'top' ? adjustedTargetIndex : adjustedTargetIndex + 1

    newOrder.splice(insertIndex, 0, removed)

    const updates = newOrder.map((template, idx) => ({
      id: template.id,
      order_index: idx,
    }))

    await reorderMutation.mutateAsync(updates)
    setDraggedTemplateId(null)
  }

  const handleDragEnd = () => {
    setDraggedTemplateId(null)
    setDragOverTemplateId(null)
  }

  return {
    templates,
    isLoading,
    createMutation,
    copyMutation,
    deleteMutation,
    // D&D
    draggedTemplateId,
    dragOverTemplateId,
    dragOverPosition,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  }
}
