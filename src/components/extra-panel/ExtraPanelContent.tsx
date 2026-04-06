/**
 * Контент вкладки «Дополнительно» в боковой панели.
 * Показывает системные секции документов: Нераспределённые, Источник, Папка назначения, Корзина.
 * Переиспользует DocumentKitsTab с showSystemSection=true, без папок и тулбара.
 */

import { Loader2 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { projectKeys, documentKitKeys } from '@/hooks/queryKeys'
import { getProjectById } from '@/services/api/projectService'
import { supabase } from '@/lib/supabase'
import { DocumentKitsTab } from '@/components/projects/DocumentKitsTab'
import type { DocumentKitWithDocuments } from '@/services/api/documents/documentKitService'

interface ExtraPanelContentProps {
  projectId: string
  workspaceId: string
}

export function ExtraPanelContent({ projectId, workspaceId }: ExtraPanelContentProps) {
  const queryClient = useQueryClient()

  // Загружаем проект для source_folder_id и export_folder_id
  const { data: project, isLoading: isProjectLoading } = useQuery({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => getProjectById(projectId),
    staleTime: 60_000,
  })

  // Загружаем первый kitId для правой панели — отдельный ключ, чтобы не перезаписывать
  // основной кэш documentKitKeys.byProject (который хранит полные данные с документами).
  // initialData: если юзер уже был на вкладке Документы, берём первый kitId из кэша —
  // запрос не нужен вовсе.
  const { data: documentKits = [], isLoading: isKitsLoading } = useQuery({
    queryKey: [...documentKitKeys.byProject(projectId), 'firstKitId'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_kits')
        .select('id')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
        .limit(1)
      if (error) throw error
      return data || []
    },
    staleTime: 60_000,
    initialData: () => {
      const fullKits = queryClient.getQueryData<DocumentKitWithDocuments[]>(
        documentKitKeys.byProject(projectId),
      )
      if (!fullKits || fullKits.length === 0) return undefined
      // Берём первый kit (они уже отсортированы по sort_order на сервере)
      return [{ id: fullKits[0].id }]
    },
  })

  const isLoading = isProjectLoading || isKitsLoading
  const kitId = documentKits[0]?.id

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!kitId) {
    return (
      <div className="flex items-center justify-center h-full px-4">
        <p className="text-sm text-muted-foreground text-center">
          Нет наборов документов в проекте
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <DocumentKitsTab
        projectId={projectId}
        workspaceId={workspaceId}
        kitId={kitId}
        sourceFolderId={project?.source_folder_id}
        exportFolderId={project?.export_folder_id}
        showSystemSection
        showToolbar={false}
        showFolders={false}
      />
    </div>
  )
}
