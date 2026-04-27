"use client"

/**
 * Страница проекта
 * Рефакторинг: логика вынесена в хуки, UI — в подкомпоненты
 * Диалоги — ProjectPageDialogs, вкладки — ProjectTabsContent
 */

import { useEffect, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Plus } from 'lucide-react'
import { useDocumentKitsQuery } from '@/hooks/useDocumentKitsQuery'
import { useFormKitsQuery } from '@/hooks/useFormKitsQuery'
import { projectTemplateKeys, STALE_TIME } from '@/hooks/queryKeys'
import { useSidePanelStore } from '@/store/sidePanelStore'
import {
  useProjectPermissions,
  useWorkspaceFeatures,
  useWorkspacePermissions,
} from '@/hooks/permissions'
import { useDialog } from '@/hooks/shared/useDialog'
import { usePageTitle } from '@/hooks/usePageTitle'

// Рефакторенные компоненты и хуки
import {
  ProjectPageDialogs,
  ProjectTabsContent,
  ProjectHeader,
  ProjectPageState,
} from './ProjectPage/components'
import {
  useProjectData,
  useProjectAccess,
  useProjectModules,
  useProjectHeaderParticipants,
} from './ProjectPage/hooks'
import { useProjectMutations } from './ProjectPage/hooks/useProjectMutations'
import { useProjectGoogleDrive } from './ProjectPage/hooks/useProjectGoogleDrive'
import { useProjectGoogleDriveActions } from './ProjectPage/hooks/useProjectGoogleDriveActions'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export default function ProjectPage() {
  const { workspaceId, projectId } = useParams<{ workspaceId: string; projectId: string }>()
  const router = useRouter()
  const currentSearchParams = useSearchParams()

  // Состояния UI
  const addKitDialog = useDialog()
  const addFormKitDialog = useDialog()

  // === РЕФАКТОРЕННЫЕ ХУКИ ===

  // Данные проекта
  const { project, projectTemplate, isLoading } = useProjectData(projectId)
  usePageTitle(project?.name)
  const { data: participantGroups = [] } = useProjectHeaderParticipants(projectId, workspaceId)

  // Проверка доступа
  const { hasAccess: hasProjectAccess, isLoading: checkingAccess } = useProjectAccess(
    projectId,
    workspaceId,
  )

  // Модули проекта
  const {
    modules,
    availableModules,
    getFirstAvailableTab,
    isLoading: loadingModules,
  } = useProjectModules(projectId, workspaceId, projectTemplate)

  // Мутации
  const {
    updateProjectName,
    updateProjectStatus,
    updateProjectDeadline,
    updateProjectGoogleDrive,
    updateProjectFields,
  } = useProjectMutations(projectId)

  // Загрузка списка шаблонов для workspace
  const { data: projectTemplates = [] } = useQuery({
    queryKey: projectTemplateKeys.listByWorkspace(workspaceId),
    queryFn: async () => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('project_templates')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: !!workspaceId,
    staleTime: STALE_TIME.LONG,
  })

  // Проверка прав доступа
  const { can: hasProjectPermission } = useProjectPermissions({
    projectId: projectId || '',
  })
  useWorkspaceFeatures({ workspaceId: workspaceId || '' })

  // Определяем, является ли пользователь только клиентом
  const { isClientOnly } = useWorkspacePermissions({ workspaceId: workspaceId || '' })

  // Права на действия
  const canAddForms = hasProjectPermission('forms', 'add_forms')
  const canAddDocumentKits = hasProjectPermission('documents', 'add_document_kits')
  const canEditProjectInfo = hasProjectPermission('settings', 'edit_project_info')
  const canManageGoogleDrive = hasProjectPermission('settings', 'manage_google_drive')

  // Google Drive (запрос только если есть право manage_google_drive)
  const googleDrive = useProjectGoogleDrive(project, canManageGoogleDrive, workspaceId)

  // === URL И НАВИГАЦИЯ ===

  const searchParams = new URLSearchParams(currentSearchParams.toString())
  const firstTab = getFirstAvailableTab()
  const urlTab = searchParams.get('tab') || firstTab

  const isTabAccessible = (tab: string) => availableModules.some((m) => m.id === tab)
  const activeTab = isTabAccessible(urlTab) ? urlTab : firstTab

  // Запросы зависят от активной вкладки — грузим только то, что видим.
  // documentKits нужны в Документах, formKits — в Анкетах. Если юзер сразу идёт
  // в Задачи/Историю/БЗ — эти данные не подгружаются.
  const { data: documentKits = [] } = useDocumentKitsQuery(projectId, activeTab === 'documents')
  const { data: formKits = [] } = useFormKitsQuery(projectId, activeTab === 'forms')

  const handleTabChange = (tab: string) => {
    router.replace(`/workspaces/${workspaceId}/projects/${projectId}?tab=${tab}`)
  }

  // === ЭФФЕКТЫ ===

  // Боковая панель: передаём контекст проекта + messenger
  const setContext = useSidePanelStore((s) => s.setContext)
  const setChatsEnabled = useSidePanelStore((s) => s.setChatsEnabled)
  const sidePanelOpen = useSidePanelStore((s) => s.panelTab !== null)

  const panelTab = useSidePanelStore((s) => s.panelTab)

  // Флаг: не сохранять panelTab пока восстановление не завершилось
  const panelRestoredRef = useRef(false)

  // projectId устанавливаем сразу, не дожидаясь projectTemplate
  // + восстанавливаем состояние панели per-project
  // Контекст проекта в стор. Авто-открытие основной правой панели отключено
  // (раньше при заходе на проект она открывалась автоматически на вкладке
  // 'client' или восстанавливала сохранённую). Теперь панель открывается
  // ТОЛЬКО по клику на кнопки FloatingPanelButtons — это убирает визуальный
  // конфликт с системой вкладок треда (TaskPanelTabbedShell).
  useEffect(() => {
    panelRestoredRef.current = true
    if (projectId && !loadingModules) {
      setContext({ projectId })
    }
    return () => {
      setContext({ projectId: undefined, templateId: undefined })
    }
  }, [projectId, setContext, loadingModules])

  // Сохранять panelTab per-project при изменении (только после восстановления)
  useEffect(() => {
    if (projectId && panelRestoredRef.current) {
      try {
        localStorage.setItem(`cc:panel-tab:${projectId}`, String(panelTab))
      } catch {
        /* ignore */
      }
    }
  }, [panelTab, projectId])

  // templateId устанавливаем отдельно, когда загрузится
  useEffect(() => {
    if (projectTemplate) {
      setContext({ templateId: projectTemplate.id })
    }
  }, [projectTemplate, setContext])

  // Chats enabled — обновляем только когда данные проекта загружены.
  useEffect(() => {
    if (!isLoading) {
      setChatsEnabled(!!modules.chats)
    }
  }, [modules.chats, isLoading, setChatsEnabled])

  // URL-обработчик ?panel=messenger&chatId=... убран. Раньше клик на бейдж
  // непрочитанных в сайдбаре делал navigate с этими параметрами и открывал
  // старую «основную» правую панель. Теперь сайдбар открывает тред напрямую
  // в новой системе вкладок (через globalOpenThread).

  // === ОБРАБОТЧИКИ ===

  const handleStatusChange = (newStatusId: string) => {
    updateProjectStatus.mutate(newStatusId)
  }

  const handleDeadlineChange = (date: Date | undefined) => {
    updateProjectDeadline.mutate(date)
  }

  const handleDescriptionChange = (description: string) => {
    updateProjectFields.mutate({ description })
  }

  const handleTemplateChange = (templateId: string | null) => {
    updateProjectFields.mutate({ template_id: templateId })
  }

  const {
    handleSaveGoogleDriveLink,
    handleDisconnectGoogleDrive,
    handleCreateGoogleDriveFolder,
  } = useProjectGoogleDriveActions({
    workspaceId,
    rootFolderId: projectTemplate?.root_folder_id,
    updateProjectGoogleDrive,
    closeDialog: googleDrive.closeDialog,
    folderLink: googleDrive.folderLink,
  })

  // === РЕНДЕРИНГ ===

  // Показываем загрузку только при первоначальной загрузке (project ещё не получен).
  // Не уходим на экран загрузки при ре-рендерах (когда project уже есть),
  // иначе открытие боковой панели вызывало мигание флагов isLoading и скрывало контент.
  if (!project && (isLoading || checkingAccess || loadingModules)) {
    return <ProjectPageState type="loading" />
  }

  if (hasProjectAccess === false) {
    return (
      <ProjectPageState
        type="access-denied"
        onBack={() => router.push(`/workspaces/${workspaceId}`)}
      />
    )
  }

  if (!project) {
    return (
      <ProjectPageState
        type="not-found"
        onBack={() => router.push(`/workspaces/${workspaceId}/projects`)}
      />
    )
  }

  return (
    <WorkspaceLayout>
      <ErrorBoundary title="Ошибка в проекте">
        <div
          data-project-scroll
          onScroll={(e) => {
            // Гарантия: левая граница контента проекта никогда не уходит под сайдбар.
            // overflow-x:hidden не блокирует программный scrollLeft (его может выставить
            // scrollIntoView / useScrollIntoViewOnPanel при смене вкладок с открытой
            // боковой панелью) — сбрасываем вручную.
            if (e.currentTarget.scrollLeft !== 0) e.currentTarget.scrollLeft = 0
          }}
          className={cn(
            'flex-1 overflow-y-auto overflow-x-hidden scrollbar-auto-hide p-3 relative',
            'md:pt-4 md:pb-8 md:pl-8',
            sidePanelOpen ? 'md:pr-3' : 'md:pr-8',
            activeTab === 'documents' && 'bg-white',
          )}
        >
          <div className={cn('max-w-7xl space-y-3', activeTab === 'documents' && 'relative')}>
            {/* Редактируемое название проекта */}
            <ProjectHeader
              projectName={project.name}
              canEdit={canEditProjectInfo}
              updateProjectName={updateProjectName}
              templateName={projectTemplate?.name}
              participantGroups={participantGroups}
              workspaceId={project.workspace_id}
              projectTemplateId={project.template_id}
              statusId={project.status_id}
              onStatusChange={handleStatusChange}
            />

            {/* Вкладки — скрыты для клиента (навигация в боковой панели) */}
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              {!isClientOnly && (
                <div className="pb-3">
                  <TabsList>
                    {availableModules
                      .filter((m) => m.showTab !== false)
                      .map((m) => {
                        const Icon = m.icon
                        return (
                          <TabsTrigger
                            key={m.id}
                            value={m.id}
                            className="flex items-center gap-1 md:gap-2"
                            title={m.label}
                          >
                            <Icon className="w-4 h-4" />
                            {!m.iconOnly && <span className="hidden md:inline">{m.label}</span>}
                            {m.id === 'forms' && activeTab === 'forms' && canAddForms && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    className="ml-0.5 p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                                  >
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </span>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                  <DropdownMenuItem onClick={addFormKitDialog.open}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Добавить анкету
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TabsTrigger>
                        )
                      })}
                  </TabsList>
                </div>
              )}

              <ProjectTabsContent
                project={project}
                projectId={projectId ?? ''}
                workspaceId={workspaceId ?? ''}
                activeTab={activeTab}
                modules={modules}
                canEditProjectInfo={canEditProjectInfo}
                canManageGoogleDrive={canManageGoogleDrive}
                templateName={projectTemplate?.name ?? null}
                templates={projectTemplates}
                onStatusChange={handleStatusChange}
                onDeadlineChange={handleDeadlineChange}
                onDescriptionChange={handleDescriptionChange}
                onTemplateChange={handleTemplateChange}
                googleDrive={googleDrive}
                isSavingGoogleDrive={updateProjectGoogleDrive.isPending}
                onSaveGoogleDriveLink={handleSaveGoogleDriveLink}
                onCreateGoogleDriveFolder={handleCreateGoogleDriveFolder}
                onDisconnectGoogleDrive={handleDisconnectGoogleDrive}
                rootFolderId={projectTemplate?.root_folder_id}
                formKits={formKits}
                canAddForms={canAddForms}
                addFormKitDialog={addFormKitDialog}
                documentKits={documentKits}
                canAddDocumentKits={canAddDocumentKits}
                addKitDialog={addKitDialog}
              />
            </Tabs>
          </div>
        </div>

        <ProjectPageDialogs
          projectId={projectId ?? ''}
          workspaceId={workspaceId ?? ''}
          projectTemplate={projectTemplate}
          googleDriveFolderLink={project?.google_drive_folder_link}
          projectName={project?.name}
          addKitDialog={addKitDialog}
          addFormKitDialog={addFormKitDialog}
          onTabChange={handleTabChange}
        />
      </ErrorBoundary>
    </WorkspaceLayout>
  )
}
