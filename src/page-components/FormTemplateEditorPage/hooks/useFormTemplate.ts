/**
 * Хук для загрузки и обновления шаблона анкеты
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { formTemplateKeys } from '@/hooks/queryKeys'
import { FormTemplate } from '../types'

export function useFormTemplate(templateId: string | undefined) {
  const queryClient = useQueryClient()

  // Загрузка шаблона
  const templateQuery = useQuery({
    queryKey: formTemplateKeys.detail(templateId),
    queryFn: async () => {
      if (!templateId) return null

      const { data, error } = await supabase
        .from('form_templates')
        .select('*')
        .eq('id', templateId)
        .single()

      if (error) throw error
      return data as FormTemplate
    },
    enabled: !!templateId,
  })

  // Обновление названия, описания и AI промпта
  const updateMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; aiExtractionPrompt: string }) => {
      if (!templateId) return

      const { error } = await supabase
        .from('form_templates')
        .update({
          name: data.name,
          description: data.description || null,
          ai_extraction_prompt: data.aiExtractionPrompt || null,
        })
        .eq('id', templateId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: formTemplateKeys.detail(templateId) })
    },
    onError: (error) => {
      logger.error('Failed to update form template:', error)
      toast.error('Не удалось обновить шаблон')
    },
  })

  return {
    template: templateQuery.data,
    isLoading: templateQuery.isLoading,
    updateTemplate: updateMutation.mutate,
    updateTemplateAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  }
}
