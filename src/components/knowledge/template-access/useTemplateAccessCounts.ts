/**
 * Хук для пакетной загрузки счётчиков привязанных шаблонов.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { templateAccessKeys } from '@/hooks/queryKeys'
import { getAccessConfig, type TemplateAccessEntityType } from './helpers'

export function useTemplateAccessCounts(
  entityIds: string[],
  entityType: TemplateAccessEntityType,
) {
  const config = entityIds.length > 0 ? getAccessConfig(entityType, entityIds[0]) : null
  const table = config?.table
  const fkColumn = config?.fkColumn

  return useQuery({
    queryKey: templateAccessKeys.counts(entityType, entityIds),
    queryFn: async () => {
      if (entityIds.length === 0 || !table || !fkColumn) return {} as Record<string, number>
      const { data, error } = await supabase.from(table).select(fkColumn).in(fkColumn, entityIds)
      if (error) throw error

      const counts: Record<string, number> = {}
      for (const row of data || []) {
        const id = (row as unknown as Record<string, string>)[fkColumn]
        counts[id] = (counts[id] || 0) + 1
      }
      return counts
    },
    enabled: entityIds.length > 0,
  })
}
