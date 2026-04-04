"use client"

/**
 * Страница проекта
 * Рефакторинг: логика вынесена в хуки, UI — в подкомпоненты
 * Диалоги — ProjectPageDialogs, вкладки — ProjectTabsContent
 */

import { useEffect, useRef } from 'react'
import { useParams, useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
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
import { useSidePanelStore } from '@/store/sidePanelStore'
import {
  useProjectPermissions,
  useWorkspaceFeatures,
  useWorkspacePermissions,
} from '@/hooks/permissions'
import { SYSTEM_WORKSPACE_ROLES } from '@/types/permissions'
import { useAuth } from '@/contexts/AuthContext'
import { useDialog } from '@/hooks/shared/useDialog'

// Рефакторенные компоненты и хуки
import {
  ProjectPageDialogs,
  ProjectTabsContent,
  ProjectHeader,
  ProjectPageState,
  HistoryUnreadBadge,
} from './ProjectPage/components'
import {
  useProjectData,
  useProjectAccess,
  useProjectModules,
  useProjectHeaderParticipants,
} from './ProjectPage/hooks'
import { useProjectMutations } from './ProjectPage/hooks/useProjectMutations'
import { useProjectGoogleDrive } from './ProjectPage/hooks/useProjectGoogleDrive'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { logger } from '@/utils/logger'

export default function ProjectPage() {
  const { workspaceId, projectId } = useParams<{ workspaceId: string; projectId: string }>()
  const router = useRouter()
  const pathname = usePathname()
  const currentSearchParams = useSearchParams()
  const { user } = useAuth()
  const { data: documentKits = [] } = useDocumentKitsQuery(projectId)
  const { data: formKits = [] } = useFormKitsQuery(projectId)

  // Состояния UI
  const addKitDialog = useDialog()
  const addFormKitDialog = useDialog()

  // === РЕФАКТОРЕННЫЕ ХУКИ ===

  // Данные проекта
  const { project, projectTemplate, isLoading } = useProjectData(projectId)
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
    queryKey: ['project-templates', workspaceId],
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
    staleTime: 5 * 60 * 1000,
  })

  // Проверка прав доступа
  const { can: hasProjectPermission } = useProjectPermissions({
    projectId: projectId || '',
  })
  useWorkspaceFeatures({ workspaceId: workspaceId || '' })

  // Определяем, является ли пользователь только клиентом
  const { userRoles } = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  const isClientOnly =
    userRoles.length > 0 && userRoles.every((role) => role === SYSTEM_WORKSPACE_ROLES.CLIENT)

  // Права на действия
  const canAddForms = hasProjectPermission('forms', 'add_forms')
  const canAddDocumentKits = hasProjectPermission('documents', 'add_document_kits')
  const canEditProjectInfo = hasProjectPermission('settings', 'edit_project_info')
  const canManageGoogleDrive = hasProjectPermission('settings', 'manage_google_drive')

  // Google Drive (запрос только если есть право manage_google_drive)
  const googleDrive = useProjectGoogleDrive(project, canManageGoogleDrive, workspaceId)

  // === URL И НАВИГАЦИЯ ===

  const searchParams = new URLSearchParams(currentSearchParams.toString())
  const urlTab = searchParams.get('tab') || 'documents'

  const isTabAccessible = (tab: string) => availableModules.some((m) => m.id === tab)
  const activeTab = isTabAccessible(urlTab) ? urlTab : getFirstAvailableTab()

  const handleTabChange = (tab: string) => {
    router.push(`/workspaces/${workspaceId}/projects/${projectId}?tab=${tab}`, { replace: true })
  }

  // === ЭФФЕКТЫ ===

  // Боковая панель: передаём контекст проекта + messenger
  const setContext = useSidePanelStore((s) => s.setContext)
  const setMessengerEnabled = useSidePanelStore((s) => s.setMessengerEnabled)
  const setInternalMessengerEnabled = useSidePanelStore((s) => s.setInternalMessengerEnabled)
  const sidePanelOpen = useSidePanelStore((s) => s.panelTab !== null)

  const panelTab = useSidePanelStore((s) => s.panelTab)
  const openPanel = useSidePanelStore((s) => s.openPanel)
  const closePanel = useSidePanelStore((s) => s.closePanel)

  // Флаг: не сохранять panelTab пока восстановление не завершилось
  const panelRestoredRef = useRef(false)

  // projectId устанавливаем сразу, не дожидаясь projectTemplate
  // + восстанавливаем состояние панели per-project
  // Панель ВСЕГДА открыта в проекте. Вкладка — сохранённая или 'client' по умолчанию.
  useEffect(() => {
    panelRestoredRef.current = false
    if (projectId) {
      setContext({ projectId })
      // Восстановить вкладку панели для этого проекта (после setContext)
      requestAnimationFrame(() => {
        try {
          const saved = localStorage.getItem(`cc:panel-tab:${projectId}`)
          // Панель всегда открыта: восстанавливаем сохранённую вкладку или 'client'
          if (saved && saved !== 'null' && saved !== '"null"') {
            const tab = saved.startsWith('"') ? JSON.parse(saved) : saved
            openPanel(tab as 'client' | 'internal' | 'assistant' | 'extra')
          } else {
            openPanel('client')
          }
        } catch {
          openPanel('client')
        }
        panelRestoredRef.current = true
      })
    }
    return () => {
      setContext({ projectId: undefined, templateId: undefined })
    }
  }, [projectId, setContext, openPanel, closePanel])

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

  // Messenger enabled — обновляем только когда данные проекта загружены
  useEffect(() => {
    // Не сбрасываем в false пока данные грузятся — чтобы кнопка не мигала при переключении проектов
    if (!isLoading) {
      setMessengerEnabled(!!modules.messenger)
      setInternalMessengerEnabled(!!modules.internalMessenger)
    }
  }, [
    modules.messenger,
    modules.internalMessenger,
    isLoading,
    setMessengerEnabled,
    setInternalMessengerEnabled,
  ])

  // Открытие мессенджера по URL-параметру ?panel=messenger&channel=internal (клик на бейдж в сайдбаре)
  // chatId уже сохранён в localStorage ДО навигации — restoreActiveChatId загрузит его при монтировании
  const openMessenger = useSidePanelStore((s) => s.openMessenger)
  useEffect(() => {
    const params = new URLSearchParams(currentSearchParams.toString())
    if (params.get('panel') === 'messenger' && modules.messenger) {
      const channel = params.get('channel') === 'internal' ? ('internal' as const) : undefined
      const chatId = params.get('chatId')
      if (chatId) {
        useSidePanelStore.getState().openChat(chatId, channel ?? 'client')
      } else {
        openMessenger(channel)
      }
      // Убираем параметры из URL, чтобы при перезагрузке не открывался повторно
      params.delete('panel')
      params.delete('channel')
      params.delete('chatId')
      const remaining = params.toString()
      router.replace(
        `/workspaces/${workspaceId}/projects/${projectId}${remaining ? `?${remaining}` : ''}`,
      )
    }
  }, [projectId, currentSearchParams.toString(), modules.messenger]) // eslint-disable-line react-hooks/exhaustive-deps -- navigate/openMessenger stable refs

  // === ОБРАБОТЧИКИ ===

  const handleStatusChange = (newStatus: string) => {
    updateProjectStatus.mutate(newStatus)
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

  const handleSaveGoogleDriveLink = async () => {
    try {
      await updateProjectGoogleDrive.mutateAsync(googleDrive.folderLink || null)
      googleDrive.closeDialog()
      toast.success('Папка Google Drive подключена')
    } catch (error) {
      logger.error('Ошибка подключения Google Drive:', error)
      toast.error('Не удалось сохранить ссылку Google Drive', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  const handleDisconnectGoogleDrive = async () => {
    try {
      await updateProjectGoogleDrive.mutateAsync(null)
      toast.success('Папка Google Drive отключена')
    } catch (error) {
      logger.error('Ошибка отключения Google Drive:', error)
      toast.error('Не удалось отключить Google Drive', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  const handleCreateGoogleDriveFolder = async (folderName: string) => {
    try {
      const rootFolderId = projectTemplate?.root_folder_id
      if (!rootFolderId) {
        toast.error('Корневая папка не настроена в типе проекта')
        return
      }

      const { data, error } = await supabase.functions.invoke('google-drive-create-folder', {
        body: { workspaceId, parentFolderId: rootFolderId, folderName },
      })

      if (error) throw error
      if (data?.error) {
        if (data.error === 'Google Drive not connected') {
          toast.error('Google Drive не подключён')
        } else {
          toast.error(data.error)
        }
        return
      }

      if (data?.folderLink) {
        await updateProjectGoogleDrive.mutateAsync(data.folderLink)
        googleDrive.closeDialog()
        toast.success('Папка создана и подключена')
      }
    } catch (error) {
      logger.error('Ошибка создания папки Google Drive:', error)
      toast.error('Не удалось создать папку')
    }
  }

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
                            {m.id === 'history' && projectId && (
                              <HistoryUnreadBadge projectId={projectId} />
                            )}
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
