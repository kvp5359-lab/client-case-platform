"use client"

/**
 * Запрос «неразмещённых» документов: document_kit_id IS NULL или folder_id IS NULL
 * Используется для секции «Новые» и кнопки загрузки без папки
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { kitlessDocumentKeys } from '@/hooks/queryKeys'
import type { DocumentWithFiles } from '@/components/documents/types'

export function useKitlessDocumentsQuery(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? kitlessDocumentKeys.byProject(projectId) : kitlessDocumentKeys.all,
    queryFn: async () => {
      if (!projectId) return []
      const { data, error } = await supabase
        .from('documents')
        .select(
          `
          *,
          document_files (
            id,
            file_name,
            file_path,
            file_size,
            mime_type,
            version,
            is_current,
            is_compressed,
            created_at,
            uploaded_by,
            file_id
          )
        `,
        )
        .eq('project_id', projectId)
        .or('document_kit_id.is.null,folder_id.is.null')
        .eq('is_deleted', false)
        .order('sort_order', { ascending: true })

      if (error) throw error
      // Double cast needed: PostgREST nested select returns generic Json type for relations,
      // not the specific DocumentWithFiles shape — TypeScript requires as unknown first
      return (data || []) as unknown as DocumentWithFiles[]
    },
    enabled: !!projectId,
  })
}
