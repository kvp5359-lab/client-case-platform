import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { projectTemplateKeys } from '@/hooks/queryKeys'

/** Лёгкая опция шаблона проекта (id + имя) для фильтров и селекторов. */
export type ProjectTemplateNameOption = {
  id: string
  name: string
}

/**
 * Лёгкий список шаблонов проекта (id + name) воркспейса.
 * Живёт в слое hooks (а не в page-components), чтобы переиспользоваться
 * фильтр-примитивами без захода в граф конкретной страницы.
 */
export function useProjectTemplatesQuery(workspaceId: string | null | undefined) {
  return useQuery({
    // Лёгкий список id+name → отдельный кеш namesByWorkspace, иначе обрезанные
    // строки затирали бы полный кеш listByWorkspace (редактор шаблонов).
    queryKey: projectTemplateKeys.namesByWorkspace(workspaceId ?? ''),
    queryFn: async (): Promise<ProjectTemplateNameOption[]> => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('project_templates')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .order('name')
      if (error) throw error
      return (data ?? []) as ProjectTemplateNameOption[]
    },
    enabled: !!workspaceId,
  })
}
