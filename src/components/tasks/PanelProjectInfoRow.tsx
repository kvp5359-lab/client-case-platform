"use client"

/**
 * PanelProjectInfoRow — верхняя строка боковой панели с информацией о проекте,
 * к которому относятся открытые вкладки.
 *
 * Сейчас: имя проекта, шаблон, статус, ссылка на страницу проекта.
 * Дальше можно расширять: ответственный, дедлайн и т.п.
 */

import { useRouter } from 'next/navigation'
import { ExternalLink, FolderOpen, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { projectKeys, STALE_TIME } from '@/hooks/queryKeys'
import { getProjectById } from '@/services/api/projectService'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface PanelProjectInfoRowProps {
  projectId: string | null
  workspaceId: string
  /** projectId страницы, на которой пользователь сейчас находится. Если совпадает
   *  с projectId этой строки — имя не кликабельно (мы и так уже на этой странице). */
  pageProjectId?: string | null
  /** Скрыть панель целиком (не удаляя вкладки). */
  onHidePanel?: () => void
}

export function PanelProjectInfoRow({ projectId, workspaceId, pageProjectId, onHidePanel }: PanelProjectInfoRowProps) {
  const router = useRouter()

  const { data: project } = useQuery({
    queryKey: projectKeys.detail(projectId ?? ''),
    queryFn: () => getProjectById(projectId!),
    enabled: !!projectId,
    staleTime: STALE_TIME.MEDIUM,
  })

  // Имя шаблона проекта.
  const templateId = (project as { template_id?: string | null } | undefined)?.template_id ?? null
  const { data: templateName } = useQuery<string | null>({
    queryKey: ['project-template-name', templateId ?? ''],
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

  // Текущий статус проекта (имя + цвет).
  const statusId = (project as { status_id?: string | null } | undefined)?.status_id ?? null
  const { data: status } = useQuery<{ name: string; color: string | null } | null>({
    queryKey: ['status-detail', statusId ?? ''],
    enabled: !!statusId,
    staleTime: STALE_TIME.LONG,
    queryFn: async () => {
      if (!statusId) return null
      const { data, error } = await supabase
        .from('statuses')
        .select('name, color')
        .eq('id', statusId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return { name: data.name as string, color: (data.color as string | null) ?? null }
    },
  })

  if (!projectId) return null

  const projectHref = `/workspaces/${workspaceId}/projects/${projectId}`
  const name = project?.name ?? '…'
  // Кликабельное имя — только если мы не на странице этого же проекта.
  const isOnProjectPage = !!pageProjectId && pageProjectId === projectId

  return (
    <div className="flex items-center gap-2 px-3 h-9 border-b shrink-0 bg-gray-100/60 text-xs">
      <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
      {isOnProjectPage ? (
        <span className="font-medium text-sm truncate min-w-0 shrink" title={name}>
          {name}
        </span>
      ) : (
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
      )}

      {templateName && (
        <>
          <span className="text-muted-foreground/40 shrink-0" aria-hidden>•</span>
          <span className="text-muted-foreground truncate min-w-0 shrink" title={templateName}>
            {templateName}
          </span>
        </>
      )}

      {status && (
        <>
          <span className="text-muted-foreground/40 shrink-0" aria-hidden>•</span>
          <span
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium shrink-0',
              'bg-white border border-gray-200',
            )}
            title={`Статус: ${status.name}`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: status.color ?? '#9ca3af' }}
            />
            <span className="truncate max-w-[140px]">{status.name}</span>
          </span>
        </>
      )}

      <div className="flex-1 min-w-0" />

      {/* Стрелка-открыть — тоже только если мы не на странице проекта. */}
      {!isOnProjectPage && (
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
      )}

      {/* Скрыть панель целиком (вкладки сохранятся в БД). */}
      {onHidePanel && (
        <button
          type="button"
          onClick={onHidePanel}
          className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-white transition-colors"
          title="Скрыть панель (вкладки сохранятся)"
          aria-label="Скрыть панель"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
