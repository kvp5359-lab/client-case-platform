"use client"

/**
 * Хук для загрузки данных проекта
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { getProjectById } from '@/services/api/projectService'
import { supabase } from '@/lib/supabase'
import { projectKeys, projectTemplateKeys, STALE_TIME, GC_TIME } from '@/hooks/queryKeys'
import type { ProjectTemplateWithRelations } from '../types'

/**
 * Загрузка шаблона проекта с join-ами на document_kits и forms — нужно для
 * ProjectPage (сайдбар, диалоги AddDocumentKit/AddFormKit, useProjectModules).
 * Редактор типа проекта использует другой хук с полным набором колонок и
 * отдельным ключом `projectTemplateKeys.detailFull` — чтобы кеши не конфликтовали
 * (раньше оба хука писали под один ключ `['project-template', id]` и создавали
 * гонку форм данных).
 */
export function useProjectTemplate(templateId: string | null | undefined) {
  return useQuery({
    queryKey: projectTemplateKeys.detail(templateId),
    queryFn: async () => {
      if (!templateId) return null

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
        .eq('id', templateId)
        .single()

      if (error) throw error
      return data as ProjectTemplateWithRelations
    },
    enabled: !!templateId,
    staleTime: STALE_TIME.LONG,
    gcTime: GC_TIME.LONG,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  })
}

export function useProjectData(projectId: string | undefined) {
  // Загружаем данные проекта
  const projectQuery = useQuery({
    queryKey: projectKeys.detail(projectId ?? ''),
    queryFn: async () => {
      if (!projectId) return null
      return await getProjectById(projectId)
    },
    enabled: !!projectId,
    staleTime: STALE_TIME.LONG,
    gcTime: GC_TIME.LONG,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })

  // Переиспользуем useProjectTemplate выше — тот же ключ, тот же кеш,
  // избавились от двух параллельных запросов к одному templateId.
  const templateQuery = useProjectTemplate(projectQuery.data?.template_id ?? null)

  // Системный «инбокс»-проект Telegram Business не имеет шаблона, но
  // должен предоставить вкладку чатов (треды личных диалогов) и задач.
  // Подменяем projectTemplate на синтетический, чтобы useProjectModules
  // открыл нужные вкладки без необходимости создавать настоящий шаблон.
  const project = projectQuery.data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isSystemInbox = !!(project as any)?.is_system_business_inbox
  const effectiveTemplate: ProjectTemplateWithRelations | null | undefined = isSystemInbox
    ? {
        id: '__system_business_inbox__',
        name: 'Личные диалоги Telegram',
        enabled_modules: ['chats', 'tasks'],
        root_folder_id: null,
        project_template_document_kits: [],
        project_template_forms: [],
      }
    : templateQuery.data

  return {
    project,
    projectTemplate: effectiveTemplate,
    isLoading: projectQuery.isLoading || templateQuery.isLoading,
    error: projectQuery.error || templateQuery.error,
  }
}
