"use client"

/**
 * Хук для загрузки данных проекта
 */

import { useQuery } from '@tanstack/react-query'
import { getProjectById } from '@/services/api/projectService'
import { supabase } from '@/lib/supabase'
import { projectKeys } from '@/hooks/queryKeys'
import type { ProjectTemplate } from '../types'

export function useProjectData(projectId: string | undefined) {
  // Загружаем данные проекта
  const projectQuery = useQuery({
    queryKey: projectKeys.detail(projectId ?? ''),
    queryFn: async () => {
      if (!projectId) return null
      return await getProjectById(projectId)
    },
    enabled: !!projectId,
  })

  // Загружаем шаблон проекта
  const templateQuery = useQuery({
    queryKey: ['project-template', projectQuery.data?.template_id],
    queryFn: async () => {
      if (!projectQuery.data?.template_id) return null

      const { data, error } = await supabase
        .from('project_templates')
        .select(
          `
          id,
          name,
          enabled_modules,
          root_folder_id,
          project_template_document_kits(document_kit_template_id),
          project_template_forms(form_template_id)
`,
        )
        .eq('id', projectQuery.data.template_id)
        .single()

      if (error) throw error
      // data is guaranteed non-null by .single() — it throws on no rows
      return data as ProjectTemplate
    },
    enabled: !!projectQuery.data?.template_id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  })

  return {
    project: projectQuery.data,
    projectTemplate: templateQuery.data,
    isLoading: projectQuery.isLoading || templateQuery.isLoading,
    error: projectQuery.error || templateQuery.error,
  }
}
