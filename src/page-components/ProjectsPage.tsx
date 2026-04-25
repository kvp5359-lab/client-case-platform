"use client"

import { useState, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import { useParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useDialog } from '@/hooks/shared/useDialog'
import { useWorkspaceContext } from '@/contexts/WorkspaceContext'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { useSidebarInboxCounts } from '@/hooks/messenger/useFilteredInbox'
import { useAllProjectStatuses } from '@/hooks/useStatuses'
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import {
  ProjectStatusFilter,
  ProjectAssigneeFilter,
  ProjectTemplateFilter,
  NO_TEMPLATE_ID,
  type ProjectPreset,
} from '@/components/projects/filters'
import {
  useProjectsQuery,
  useProjectTemplatesQuery,
  useProjectParticipantsQuery,
  useProjectsPageMutations,
} from './ProjectsPage/hooks/useProjectsPageData'
import { ProjectsPageControls } from './ProjectsPage/components/ProjectsPageControls'
import { ProjectRow } from './ProjectsPage/components/ProjectRow'

export default function ProjectsPage() {
  usePageTitle('Проекты')
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { workspaceId: currentWorkspaceId } = useWorkspaceContext()
  const { user } = useAuth()
  const createDialog = useDialog()
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const activeWorkspaceId = workspaceId || currentWorkspaceId
  const permissionsResult = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  const canEdit = permissionsResult.isOwner || permissionsResult.can('edit_all_projects')

  const [searchQuery, setSearchQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [presetPopoverOpen, setPresetPopoverOpen] = useState(false)
  const [preset, setPreset] = useState<ProjectPreset>('active')
  const [filtersModified, setFiltersModified] = useState(false)
  // Статус-фильтр теперь хранит uuid из таблицы statuses (раньше — текстовые
  // 'active'/'paused'/'completed'/'archived'). Стартовое значение пустое — заполняется
  // эффектом ниже после загрузки списка статусов воркспейса.
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set())
  const [assigneeFilter, setAssigneeFilter] = useState<Set<string>>(new Set())
  const [templateFilter, setTemplateFilter] = useState<Set<string>>(new Set())

  const { data: allProjectStatuses = [] } = useAllProjectStatuses(activeWorkspaceId ?? undefined)

  // Маппинг пресета → набор status_id по флагам is_default/is_final.
  // 'active' = всё, что НЕ is_final (активные/в работе).
  // 'completed' = is_final.
  // 'archived' = пока без отдельного флага в БД — оставляем пустой набор
  // (=== «все»). Когда добавим флаг is_archived — поправим тут.
  const statusIdsForPreset = (p: ProjectPreset): Set<string> => {
    if (p === 'active') {
      return new Set(allProjectStatuses.filter((s) => !s.is_final).map((s) => s.id))
    }
    if (p === 'completed') {
      return new Set(allProjectStatuses.filter((s) => s.is_final).map((s) => s.id))
    }
    return new Set()
  }

  const applyPreset = (p: ProjectPreset) => {
    setPreset(p)
    setFiltersModified(false)
    setAssigneeFilter(new Set())
    setTemplateFilter(new Set())
    setStatusFilter(statusIdsForPreset(p))
  }

  // При первой загрузке статусов — применяем текущий пресет, чтобы фильтр
  // «Активные» сработал автоматически (раньше работал на жёстких строках).
  useEffect(() => {
    if (!filtersModified && allProjectStatuses.length > 0 && statusFilter.size === 0) {
      setStatusFilter(statusIdsForPreset(preset))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allProjectStatuses.length])

  const markModified = () => setFiltersModified(true)

  const { data: projects, isLoading, refetch } = useProjectsQuery(
    activeWorkspaceId,
    user?.id,
    permissionsResult,
  )
  const { data: templates = [] } = useProjectTemplatesQuery(activeWorkspaceId)
  const { data: participantsData } = useProjectParticipantsQuery(activeWorkspaceId)
  const { projectData } = useSidebarInboxCounts(activeWorkspaceId ?? '')
  const {
    deleteProjectMutation,
    updateStatusMutation,
    toggleRoleParticipantMutation,
  } = useProjectsPageMutations(activeWorkspaceId, user?.id)

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
        statusFilter.size === 0 || (project.status_id != null && statusFilter.has(project.status_id))

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
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-semibold">Проекты</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Список всех проектов в workspace
              </p>
            </div>
          </div>

          <ProjectsPageControls
            preset={preset}
            filtersModified={filtersModified}
            filtersOpen={filtersOpen}
            presetPopoverOpen={presetPopoverOpen}
            onPresetPopoverChange={setPresetPopoverOpen}
            onApplyPreset={applyPreset}
            onToggleFilters={() => setFiltersOpen((v) => !v)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onCreate={createDialog.open}
          />

          {filtersOpen && (
            <div className="flex items-center gap-1.5 mb-4">
              <ProjectStatusFilter
                workspaceId={activeWorkspaceId}
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

          {isLoading ? (
            <div className="flex justify-center py-16">
              <p className="text-sm text-muted-foreground">Загрузка...</p>
            </div>
          ) : filteredProjects.length > 0 ? (
            <div className="rounded-md border-t">
              {filteredProjects.map((project) => {
                const templateName = project.template_id
                  ? templates.find((t) => t.id === project.template_id)?.name ?? null
                  : null
                return (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    workspaceId={activeWorkspaceId}
                    templateName={templateName}
                    participantGroups={participantsData?.byProjectGroups?.[project.id] ?? []}
                    badge={projectData.badgeDisplays.get(project.id) ?? { type: 'none' }}
                    badgeColor={projectData.badgeColors.get(project.id)}
                    canEdit={canEdit}
                    onToggleRoleParticipant={(args) => toggleRoleParticipantMutation.mutate(args)}
                    onChangeStatus={(projectId, statusId) =>
                      updateStatusMutation.mutate({ projectId, statusId })
                    }
                    onDelete={handleDeleteProject}
                  />
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
