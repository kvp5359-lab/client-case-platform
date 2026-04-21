"use client"

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Tables } from '@/types/database'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Search, MoreHorizontal, Trash2, X, FolderOpen } from 'lucide-react'
import { ParticipantAvatars, type AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import { AssigneesPopover } from '@/components/tasks/AssigneesPopover'
import { ProjectStatusPopover } from '@/components/projects/ProjectStatusPopover'
import { useSidebarInboxCounts } from '@/hooks/messenger/useFilteredInbox'
import { formatBadgeCount } from '@/utils/inboxUnread'
import {
  getBadgeClasses,
  getStatusIconColor,
} from '@/components/WorkspaceSidebar/projectListConstants'
import { useWorkspaceContext } from '@/contexts/WorkspaceContext'
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { useDialog } from '@/hooks/shared/useDialog'
import { projectKeys, trashKeys } from '@/hooks/queryKeys'
import {
  ProjectStatusFilter,
  ProjectAssigneeFilter,
  ProjectTemplateFilter,
  ProjectPresetPopover,
  NO_TEMPLATE_ID,
  type ProjectAssigneeOption,
  type ProjectPreset,
  type ProjectTemplateOption,
} from '@/components/projects/filters'

type Project = Tables<'projects'>

export default function ProjectsPage() {
  usePageTitle('Проекты')
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const createDialog = useDialog()
  const [searchQuery, setSearchQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [presetPopoverOpen, setPresetPopoverOpen] = useState(false)
  const [preset, setPreset] = useState<ProjectPreset>('active')
  const [filtersModified, setFiltersModified] = useState(false)
  const [statusFilter, setStatusFilter] = useState<Set<string>>(() => new Set(['active', 'paused']))
  const [assigneeFilter, setAssigneeFilter] = useState<Set<string>>(new Set())
  const [templateFilter, setTemplateFilter] = useState<Set<string>>(new Set())

  const applyPreset = (p: ProjectPreset) => {
    setPreset(p)
    setFiltersModified(false)
    setAssigneeFilter(new Set())
    setTemplateFilter(new Set())
    if (p === 'active') setStatusFilter(new Set(['active', 'paused']))
    else if (p === 'completed') setStatusFilter(new Set(['completed']))
    else if (p === 'archived') setStatusFilter(new Set(['archived']))
    else setStatusFilter(new Set())
  }

  const markModified = () => setFiltersModified(true)
  const { workspaceId: currentWorkspaceId } = useWorkspaceContext()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const permissionsResult = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const activeWorkspaceId = workspaceId || currentWorkspaceId

  const {
    data: projects,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: projectKeys.listForUser(
      activeWorkspaceId ?? '',
      user?.id,
      permissionsResult.isOwner,
      permissionsResult.can('view_all_projects'),
    ),
    queryFn: async () => {
      if (!activeWorkspaceId) return []

      const canViewAll = permissionsResult.isOwner || permissionsResult.can('view_all_projects')

      const { data, error } = await supabase.rpc('get_user_projects', {
        p_workspace_id: activeWorkspaceId,
        p_user_id: user!.id,
        p_can_view_all: canViewAll,
      })

      if (error) throw error
      return (data || []) as Project[]
    },
    enabled: !!activeWorkspaceId && !permissionsResult.isLoading,
  })

  // Шаблоны проектов для фильтра
  const { data: templates = [] } = useQuery({
    queryKey: ['project-templates', activeWorkspaceId ?? ''],
    queryFn: async (): Promise<ProjectTemplateOption[]> => {
      if (!activeWorkspaceId) return []
      const { data, error } = await supabase
        .from('project_templates')
        .select('id, name')
        .eq('workspace_id', activeWorkspaceId)
        .order('name')
      if (error) throw error
      return (data ?? []) as ProjectTemplateOption[]
    },
    enabled: !!activeWorkspaceId,
  })

  // Участники проектов: сгруппированы по ролям (для отображения) + плоский справочник (для фильтра)
  const { data: participantsData } = useQuery({
    queryKey: ['project-participants-filter', activeWorkspaceId ?? ''],
    queryFn: async () => {
      if (!activeWorkspaceId)
        return {
          byProject: {} as Record<string, string[]>,
          byProjectGroups: {} as Record<string, { role: string; participants: AvatarParticipant[] }[]>,
          participants: [] as ProjectAssigneeOption[],
        }

      const [{ data: pp, error: ppErr }, { data: roles, error: rolesErr }] = await Promise.all([
        supabase
          .from('project_participants')
          .select(
            'project_id, participant_id, project_roles, participants!inner(id, name, last_name, avatar_url, workspace_id, is_deleted)',
          )
          .eq('participants.workspace_id', activeWorkspaceId)
          .eq('participants.is_deleted', false),
        supabase
          .from('project_roles')
          .select('name, order_index')
          .eq('workspace_id', activeWorkspaceId)
          .order('order_index'),
      ])

      if (ppErr) throw ppErr
      if (rolesErr) throw rolesErr

      const roleOrder = (roles ?? []).map((r) => r.name as string)

      const byProject: Record<string, string[]> = {}
      const participantsMap = new Map<string, ProjectAssigneeOption>()
      // project_id -> role -> AvatarParticipant[]
      const byProjectRole: Record<string, Map<string, AvatarParticipant[]>> = {}

      for (const row of pp ?? []) {
        const pid = row.participant_id as string
        const projId = row.project_id as string
        const projectRoles = (row.project_roles as string[] | null) ?? []
        ;(byProject[projId] ??= []).push(pid)

        const part = Array.isArray(row.participants) ? row.participants[0] : row.participants
        if (!part) continue

        const option: ProjectAssigneeOption = {
          id: part.id,
          name: part.name,
          last_name: part.last_name,
          avatar_url: part.avatar_url,
        }
        if (!participantsMap.has(part.id)) participantsMap.set(part.id, option)

        const avatar: AvatarParticipant = {
          id: part.id,
          name: part.name ?? '?',
          last_name: part.last_name ?? null,
          avatar_url: part.avatar_url ?? null,
        }

        const projectMap = (byProjectRole[projId] ??= new Map())
        for (const role of projectRoles) {
          if (!projectMap.has(role)) projectMap.set(role, [])
          projectMap.get(role)!.push(avatar)
        }
      }

      // Преобразуем в [{ role, participants }] в порядке roleOrder
      const byProjectGroups: Record<string, { role: string; participants: AvatarParticipant[] }[]> =
        {}
      for (const [projId, projectMap] of Object.entries(byProjectRole)) {
        byProjectGroups[projId] = roleOrder
          .filter((role) => projectMap.has(role))
          .map((role) => ({ role, participants: projectMap.get(role)! }))
      }

      return {
        byProject,
        byProjectGroups,
        participants: Array.from(participantsMap.values()),
      }
    },
    enabled: !!activeWorkspaceId,
  })

  // Агрегированные бейджи непрочитанного по проектам (та же логика, что в сайдбаре)
  const { projectData } = useSidebarInboxCounts(activeWorkspaceId ?? '')

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase
        .from('projects')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id ?? null,
        })
        .eq('id', projectId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.byWorkspace(activeWorkspaceId ?? '') })
      queryClient.invalidateQueries({ queryKey: trashKeys.all })
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: async ({ projectId, status }: { projectId: string; status: string }) => {
      const { error } = await supabase.from('projects').update({ status }).eq('id', projectId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.byWorkspace(activeWorkspaceId ?? '') })
    },
    onError: () => toast.error('Не удалось обновить статус'),
  })

  // Переключение участника в роли проекта: добавить/удалить.
  const toggleRoleParticipantMutation = useMutation({
    mutationFn: async ({
      projectId,
      participantId,
      roleName,
    }: {
      projectId: string
      participantId: string
      roleName: string
    }) => {
      const { data: existing, error: fetchErr } = await supabase
        .from('project_participants')
        .select('id, project_roles')
        .eq('project_id', projectId)
        .eq('participant_id', participantId)
        .maybeSingle()
      if (fetchErr) throw fetchErr

      if (!existing) {
        const { error } = await supabase.from('project_participants').insert({
          project_id: projectId,
          participant_id: participantId,
          project_roles: [roleName],
        })
        if (error) throw error
        return
      }

      const hasRole = existing.project_roles.includes(roleName)
      const newRoles = hasRole
        ? existing.project_roles.filter((r: string) => r !== roleName)
        : [...existing.project_roles, roleName]

      if (newRoles.length === 0) {
        const { error } = await supabase
          .from('project_participants')
          .delete()
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('project_participants')
          .update({ project_roles: newRoles })
          .eq('id', existing.id)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['project-participants-filter', activeWorkspaceId ?? ''],
      })
    },
    onError: () => toast.error('Не удалось обновить участников'),
  })

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    const ok = await confirm({
      title: 'Удалить проект?',
      description: `Проект "${projectName}" будет перемещён в корзину. Восстановить можно из раздела «Корзина» в настройках воркспейса.`,
      variant: 'destructive',
      confirmText: 'В корзину',
    })
    if (!ok) return
    try {
      await deleteProjectMutation.mutateAsync(projectId)
      toast.success('Проект перемещён в корзину')
    } catch {
      toast.error('Не удалось удалить проект')
    }
  }

  const toggleSet =
    (setter: (fn: (prev: Set<string>) => Set<string>) => void) => (id: string) => {
      setter((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      markModified()
    }

  const toggleStatus = toggleSet(setStatusFilter)
  const toggleAssignee = toggleSet(setAssigneeFilter)
  const toggleTemplate = toggleSet(setTemplateFilter)

  const filteredProjects = useMemo(() => {
    if (!projects) return []
    const byProject = participantsData?.byProject ?? {}
    const q = searchQuery.toLowerCase()

    return projects.filter((project) => {
      const matchesSearch =
        !q ||
        project.name.toLowerCase().includes(q) ||
        (project.description?.toLowerCase().includes(q) ?? false)

      const matchesStatus =
        statusFilter.size === 0 || statusFilter.has(project.status || 'active')

      const matchesTemplate =
        templateFilter.size === 0 ||
        (project.template_id
          ? templateFilter.has(project.template_id)
          : templateFilter.has(NO_TEMPLATE_ID))

      const matchesAssignee =
        assigneeFilter.size === 0 ||
        (byProject[project.id] ?? []).some((pid) => assigneeFilter.has(pid))

      return matchesSearch && matchesStatus && matchesTemplate && matchesAssignee
    })
  }, [projects, participantsData, searchQuery, statusFilter, templateFilter, assigneeFilter])

  if (!activeWorkspaceId) {
    return (
      <WorkspaceLayout>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Выберите workspace для просмотра проектов</p>
        </div>
      </WorkspaceLayout>
    )
  }

  const hasActiveFilters =
    statusFilter.size > 0 || assigneeFilter.size > 0 || templateFilter.size > 0

  return (
    <WorkspaceLayout>
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          {/* Заголовок */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-semibold">Проекты</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Список всех проектов в workspace
              </p>
            </div>
          </div>

          {/* Строка управления — стилистика как в TaskListControls */}
          <div className={cn('flex items-center gap-2', filtersOpen ? 'mb-1.5' : 'mb-4')}>
            <ProjectPresetPopover
              preset={preset}
              filtersModified={filtersModified}
              filtersOpen={filtersOpen}
              presetPopoverOpen={presetPopoverOpen}
              onPresetPopoverChange={setPresetPopoverOpen}
              onApplyPreset={applyPreset}
              onToggleFilters={() => setFiltersOpen((v) => !v)}
            />

            <div className="flex-1 flex items-center gap-2 border rounded-md px-3 h-9 bg-background">
              <Search className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder="Поиск проектов..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-sm bg-transparent focus:outline-none w-full"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Button
              size="sm"
              variant="outline"
              className="h-9 shrink-0"
              onClick={createDialog.open}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Создать проект
            </Button>
          </div>

          {/* Фильтры */}
          {filtersOpen && (
            <div className="flex items-center gap-1.5 mb-4">
              <ProjectStatusFilter
                selectedIds={statusFilter}
                onToggle={toggleStatus}
                onClear={() => setStatusFilter(new Set())}
              />
              <ProjectAssigneeFilter
                participants={participantsData?.participants ?? []}
                selectedIds={assigneeFilter}
                onToggle={toggleAssignee}
                onClear={() => setAssigneeFilter(new Set())}
              />
              <ProjectTemplateFilter
                templates={templates}
                selectedIds={templateFilter}
                onToggle={toggleTemplate}
                onClear={() => setTemplateFilter(new Set())}
              />
            </div>
          )}

          {/* Список проектов (плоская таблица в стиле задач) */}
          {isLoading ? (
            <div className="flex justify-center py-16">
              <p className="text-sm text-muted-foreground">Загрузка...</p>
            </div>
          ) : filteredProjects.length > 0 ? (
            <div className="rounded-md border-t">
              {filteredProjects.map((project) => {
                const participantGroups = participantsData?.byProjectGroups?.[project.id] ?? []
                const templateName = project.template_id
                  ? templates.find((t) => t.id === project.template_id)?.name
                  : null
                const badge = projectData.badgeDisplays.get(project.id) ?? {
                  type: 'none' as const,
                }
                const badgeColor = projectData.badgeColors.get(project.id)
                return (
                  <div
                    key={project.id}
                    className="group/row relative flex items-center gap-3 px-3 py-2 border-b border-border/50 hover:bg-muted/30 transition-colors bg-background"
                  >
                    <FolderOpen
                      className="h-4 w-4 shrink-0"
                      style={{ color: getStatusIconColor(project.status) }}
                    />
                    <Link
                      href={`/workspaces/${activeWorkspaceId}/projects/${project.id}?tab=settings`}
                      className="flex items-center gap-2 min-w-0 text-left"
                    >
                      <span className="text-sm font-medium shrink-0">{project.name}</span>
                      {templateName && (
                        <span
                          className="text-sm font-medium shrink-0 opacity-50"
                          style={{ color: getStatusIconColor(project.status) }}
                        >
                          · {templateName}
                        </span>
                      )}
                      {project.description && (
                        <span className="text-sm text-muted-foreground/60 truncate min-w-0">
                          · {project.description}
                        </span>
                      )}
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      {badge.type === 'number' && (
                        <span
                          className={cn(
                            'min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-white text-[11px] font-bold px-1 shrink-0',
                            getBadgeClasses(badgeColor, false),
                          )}
                        >
                          {formatBadgeCount(badge.value)}
                        </span>
                      )}
                      {badge.type === 'emoji' && (
                        <span
                          className={cn(
                            'inline-flex items-center justify-center w-[18px] h-[18px] rounded-full shrink-0',
                            getBadgeClasses(badgeColor, false),
                          )}
                        >
                          <span className="text-[10px] leading-none">{badge.value}</span>
                        </span>
                      )}
                      {badge.type === 'dot' && (
                        <span
                          className={cn(
                            'inline-block w-[18px] h-[18px] rounded-full shrink-0',
                            getBadgeClasses(badgeColor, false),
                          )}
                        />
                      )}
                    </div>
                    <div className="ml-auto flex items-center gap-3 shrink-0">
                      {participantGroups.length > 0 && (
                        <span className="flex items-center gap-0.5 shrink-0">
                          {participantGroups.map((group, idx) => {
                            const groupIds = new Set(group.participants.map((p) => p.id))
                            return (
                              <span
                                key={group.role}
                                className="flex items-center gap-0.5 shrink-0"
                              >
                                {idx > 0 && (
                                  <span className="text-gray-300 text-[10px] shrink-0 leading-none">·</span>
                                )}
                                <AssigneesPopover
                                  mode="controlled"
                                  workspaceId={activeWorkspaceId}
                                  assigneeIds={groupIds}
                                  onToggle={(participantId) =>
                                    toggleRoleParticipantMutation.mutate({
                                      projectId: project.id,
                                      participantId,
                                      roleName: group.role,
                                    })
                                  }
                                  align="end"
                                  triggerOverride={
                                    <button
                                      type="button"
                                      title={group.role}
                                      className="flex items-center gap-1 shrink-0 rounded-md px-0.5 py-0.5 hover:bg-muted/50 transition-colors"
                                    >
                                      <ParticipantAvatars
                                        participants={group.participants}
                                        size="sm"
                                        maxVisible={3}
                                      />
                                    </button>
                                  }
                                />
                              </span>
                            )
                          })}
                        </span>
                      )}
                      <ProjectStatusPopover
                        currentStatus={project.status}
                        onChange={(newStatus) =>
                          updateStatusMutation.mutate({ projectId: project.id, status: newStatus })
                        }
                        disabled={
                          !(
                            permissionsResult.isOwner ||
                            permissionsResult.can('edit_all_projects')
                          )
                        }
                      />
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-[70px] text-right">
                        {new Date(project.updated_at ?? '').toLocaleDateString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                        })}
                      </span>
                      {(permissionsResult.isOwner ||
                        permissionsResult.can('edit_all_projects')) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="h-6 w-6 p-0 opacity-0 group-hover/row:opacity-100 data-[state=open]:opacity-100 transition-opacity flex items-center justify-center rounded hover:bg-muted shrink-0"
                              aria-label="Меню проекта"
                            >
                              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600 text-xs"
                              onClick={() => handleDeleteProject(project.id, project.name)}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Удалить
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                )
              })}
              <div className="text-xs text-muted-foreground py-2 px-3">
                Показано {filteredProjects.length} из {projects?.length || 0} проектов
              </div>
            </div>
          ) : (
            <div className="py-16 text-center">
              <h3 className="text-base font-medium mb-1">
                {searchQuery || hasActiveFilters ? 'Проекты не найдены' : 'Нет проектов'}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchQuery || hasActiveFilters
                  ? 'Попробуйте изменить условия поиска или фильтры'
                  : 'Создайте первый проект для начала работы'}
              </p>
              {!searchQuery && !hasActiveFilters && (
                <Button size="sm" variant="outline" onClick={createDialog.open}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Создать проект
                </Button>
              )}
            </div>
          )}

          <CreateProjectDialog
            open={createDialog.isOpen}
            onOpenChange={(open) => (open ? createDialog.open() : createDialog.close())}
            onSuccess={() => {
              refetch()
              createDialog.close()
            }}
          />

          <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
        </div>
      </div>
    </WorkspaceLayout>
  )
}
