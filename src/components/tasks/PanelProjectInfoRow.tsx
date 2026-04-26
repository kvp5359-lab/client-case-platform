"use client"

/**
 * PanelProjectInfoRow — верхняя строка боковой панели с информацией о проекте,
 * к которому относятся открытые вкладки.
 *
 * Сейчас: имя проекта, шаблон, статус, ссылка на страницу проекта.
 * Дальше можно расширять: ответственный, дедлайн и т.п.
 *
 * Если боковая панель показывает тот же проект, что открыт на странице, —
 * строка прячется целиком (дублировала бы шапку страницы).
 */

import { useRouter } from 'next/navigation'
import { ExternalLink, FolderOpen, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { projectKeys, projectTemplateKeys, STALE_TIME } from '@/hooks/queryKeys'
import { getProjectById } from '@/services/api/projectService'
import { supabase } from '@/lib/supabase'
import { ProjectStatusPopover } from '@/components/projects/ProjectStatusPopover'
import { useProjectMutations } from '@/page-components/ProjectPage/hooks/useProjectMutations'
import { useProjectPermissions } from '@/hooks/permissions'

interface PanelProjectInfoRowProps {
  projectId: string
  workspaceId: string
  /** Скрыть панель целиком (вкладки сохранятся в БД). */
  onHidePanel?: () => void
}

export function PanelProjectInfoRow({ projectId, workspaceId, onHidePanel }: PanelProjectInfoRowProps) {
  const router = useRouter()

  const { data: project } = useQuery({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => getProjectById(projectId),
    staleTime: STALE_TIME.MEDIUM,
  })

  // Имя шаблона проекта.
  const templateId = (project as { template_id?: string | null } | undefined)?.template_id ?? null
  const { data: templateName } = useQuery<string | null>({
    queryKey: projectTemplateKeys.nameById(templateId),
    enabled: !!templateId,
    staleTime: STALE_TIME.LONG,
    queryFn: async () => {
      if (!templateId) return null
      const { data, error } = await supabase
        .from('project_templates')
        .select('name')
        .eq('id', templateId)
        .maybeSingle()
      if (error) throw error
      return (data?.name as string | null) ?? null
    },
  })

  const statusId = (project as { status_id?: string | null } | undefined)?.status_id ?? null

  const { updateProjectStatus } = useProjectMutations(projectId)
  const { can } = useProjectPermissions({ projectId })
  const canEditStatus = can('settings', 'edit_project_info')

  const projectHref = `/workspaces/${workspaceId}/projects/${projectId}`
  const name = project?.name ?? '…'

  return (
    <div className="flex items-center gap-2 px-3 h-9 border-b shrink-0 bg-gray-100/60 text-xs">
      <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
      <a
        href={projectHref}
        onClick={(e) => {
          if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            router.push(projectHref)
          }
        }}
        className="font-medium text-sm truncate min-w-0 shrink hover:text-primary hover:underline transition-colors"
        title={`Открыть проект: ${name}`}
      >
        {name}
      </a>

      {templateName && (
        <>
          <span className="text-muted-foreground/40 shrink-0" aria-hidden>•</span>
          <span className="text-muted-foreground truncate min-w-0 shrink" title={templateName}>
            {templateName}
          </span>
        </>
      )}

      <span className="text-muted-foreground/40 shrink-0" aria-hidden>•</span>
      <ProjectStatusPopover
        workspaceId={workspaceId}
        projectTemplateId={templateId}
        currentStatusId={statusId}
        onChange={(newId) => updateProjectStatus.mutate(newId)}
        disabled={!canEditStatus}
      />

      <div className="flex-1 min-w-0" />

      <a
        href={projectHref}
        onClick={(e) => {
          if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            router.push(projectHref)
          }
        }}
        className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-white transition-colors"
        title="Открыть проект"
        aria-label="Открыть проект"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </a>

      {onHidePanel && (
        <button
          type="button"
          onClick={onHidePanel}
          className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white border border-gray-200 transition-all duration-150 hover:scale-110 hover:rotate-90 hover:border-gray-300"
          title="Скрыть панель (вкладки сохранятся)"
          aria-label="Скрыть панель"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
