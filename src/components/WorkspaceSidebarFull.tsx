"use client"

/**
 * WorkspaceSidebarFull — полный сайдбар с навигацией, бейджами, входящими и задачами.
 * Мигрирован из WorkspaceSidebar.tsx оригинального ClientCase.
 */

import { useEffect, useState, useMemo, startTransition } from 'react'
import { useParams, useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Home, Inbox, CheckSquare, Users, Layout, Settings, BookOpen, Kanban, PinOff } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { SidebarNavButton } from './WorkspaceSidebar/SidebarNavButton'
import { ProjectsList } from './WorkspaceSidebar/ProjectsList'
import { UserProfile } from './WorkspaceSidebar/UserProfile'
import { WorkspacePicker } from './WorkspaceSidebar/WorkspacePicker'
import { useSidebarData } from './WorkspaceSidebar/useSidebarData'
import { useSidebarResize } from './WorkspaceSidebar/useSidebarResize'
import { useSidebarInboxCounts } from '@/hooks/messenger/useFilteredInbox'
import { supabase } from '@/lib/supabase'
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog'
import { useDialog } from '@/hooks/shared/useDialog'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { SYSTEM_WORKSPACE_ROLES } from '@/types/permissions'
import { usePinnedBoards } from './WorkspaceSidebar/usePinnedBoards'
import { useBoardsQuery } from '@/components/boards/hooks/useBoardsQuery'
import { useProjectTemplate, useProjectModules } from '@/page-components/ProjectPage/hooks'

/** Количество «моих» просроченных + сегодняшних задач */
function useMyUrgentTasksCount(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['my-urgent-tasks-count', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_urgent_tasks_count', {
        p_workspace_id: workspaceId!,
      })
      if (error) throw error
      return (data as number) ?? 0
    },
    enabled: !!workspaceId,
    staleTime: 60_000,
  })
}

interface WorkspaceSidebarFullProps {
  workspaceId?: string
}

export function WorkspaceSidebarFull({ workspaceId: propsWorkspaceId }: WorkspaceSidebarFullProps = {}) {
  const router = useRouter()
  const params = useParams<{ workspaceId?: string; projectId?: string }>()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const workspaceId = propsWorkspaceId || params.workspaceId

  // Extract projectId from URL + оптимистичный state для мгновенной анимации.
  const urlProjectId = pathname.match(/\/projects\/([^/]+)/)?.[1]
  const [optimisticProjectId, setOptimisticProjectId] = useState<string | undefined>(urlProjectId)
  // Синхронизация с URL, когда навигация завершилась (или была сделана не через sidebar).
  useEffect(() => {
    setOptimisticProjectId(urlProjectId)
  }, [urlProjectId])
  const activeProjectId = optimisticProjectId
  const { user } = useAuth()

  const {
    workspaces,
    projects,
    loadingWorkspaces,
    loadingProjects,
    currentWorkspace,
    permissionsResult,
    refreshProjects,
  } = useSidebarData({ workspaceId })

  const {
    can: hasPermission,
    isOwner,
    userRoles,
    isLoading: permissionsLoading,
  } = permissionsResult

  const isClientOnly =
    !permissionsLoading &&
    userRoles.length > 0 &&
    userRoles.every((role) => role === SYSTEM_WORKSPACE_ROLES.CLIENT)

  const { sidebarWidth, handleMouseDown } = useSidebarResize()

  // Сохраняем последний активный workspaceId для страниц без workspaceId в URL (например /profile)
  useEffect(() => {
    if (workspaceId) {
      try { localStorage.setItem('cc:last-workspace-id', workspaceId) } catch { /* ignore */ }
    }
  }, [workspaceId])

  // Вкладки активного проекта для клиентского режима.
  // template_id берём из уже загруженного списка projects — без лишнего запроса за проектом.
  const activeProjectTemplateId = projects.find((p) => p.id === activeProjectId)?.template_id
  const { data: projectTemplate } = useProjectTemplate(activeProjectTemplateId)
  const { availableModules } = useProjectModules(activeProjectId, workspaceId, projectTemplate)

  // Показываем предыдущий список вкладок, пока загружаются реальные —
  // у клиента набор вкладок обычно одинаковый во всех проектах.
  const [lastModules, setLastModules] = useState(availableModules)
  useEffect(() => {
    if (availableModules.length > 0) setLastModules(availableModules)
  }, [availableModules])
  const displayModules = availableModules.length > 0 ? availableModules : lastModules
  // Активная вкладка из URL
  const activeTab = isClientOnly ? (searchParams.get('tab') || 'documents') : undefined

  const createProjectDialog = useDialog()
  // Один вызов useSidebarInboxCounts вместо двух отдельных useTotalFilteredUnreadCount +
  // useProjectFilteredUnreadCounts — раньше useFilteredInbox (с useMemo-фильтрацией) вычислялся
  // дважды на каждый рендер сайдбара.
  const { totalUnread, projectData: projectUnreadData } = useSidebarInboxCounts(workspaceId ?? '')
  const badgeDisplays = projectUnreadData.badgeDisplays
  const clientUnreadCounts = projectUnreadData.clientUnreadCounts
  const internalUnreadCounts = projectUnreadData.internalUnreadCounts
  const projectThreadIds = projectUnreadData.threadIds
  const badgeColors = projectUnreadData.badgeColors

  const inboxBadge =
    totalUnread && totalUnread > 0 ? (totalUnread > 99 ? '99+' : String(totalUnread)) : undefined
  const { data: urgentTasksCount } = useMyUrgentTasksCount(workspaceId)
  const tasksBadge =
    urgentTasksCount && urgentTasksCount > 0
      ? urgentTasksCount > 99 ? '99+' : String(urgentTasksCount)
      : undefined

  // Закреплённые доски в сайдбаре
  const { pinnedIds: pinnedBoardIds, togglePin: toggleBoardPin } = usePinnedBoards(workspaceId)
  const { data: allBoards } = useBoardsQuery(workspaceId)
  const pinnedBoards = useMemo(
    () => pinnedBoardIds
      .map((id) => allBoards?.find((b) => b.id === id))
      .filter(Boolean) as NonNullable<typeof allBoards>[number][],
    [pinnedBoardIds, allBoards],
  )

  // Realtime-подписка на project_messages вынесена в useWorkspaceMessagesRealtime
  // (WorkspaceLayoutImpl) — один канал на весь workspace вместо дубля здесь.

  const buildHref = (path: string) => {
    // Защита от open-redirect: блокируем protocol-relative URL (//evil.com) и /\evil.com
    if (path.startsWith('//') || path.startsWith('/\\')) return '#'
    if (path.startsWith('/')) return path
    if (!workspaceId) return '#'
    return `/workspaces/${workspaceId}/${path}`
  }

  const handleNavigate = (path: string) => {
    // startTransition: навигация — low-priority update, так что Next.js не блокирует
    // main thread тяжёлым ререндером страницы и CSS-анимация в сайдбаре запускается сразу.
    startTransition(() => {
      router.push(buildHref(path))
    })
  }

  const isNavActive = (href: string) => {
    if (!workspaceId) return false
    const fullPath = `/workspaces/${workspaceId}/${href}`
    if (href === '') {
      return pathname === fullPath || pathname === `/workspaces/${workspaceId}`
    }
    return pathname.startsWith(fullPath)
  }

  const handleBadgeClick = (projectId: string, channel: 'client' | 'internal' = 'client') => {
    const isCurrentProject = projectId === activeProjectId
    const threadIdEntry = projectThreadIds?.get(projectId)
    const threadId = channel === 'internal' ? threadIdEntry?.internal : threadIdEntry?.client
    if (isCurrentProject) {
      if (threadId) {
        useSidePanelStore.getState().openChat(threadId, channel)
      } else {
        useSidePanelStore.getState().openMessenger(channel)
      }
    } else {
      if (threadId) {
        try {
          localStorage.setItem(`cc:active-thread:${projectId}`, JSON.stringify(threadId))
        } catch { /* ignore */ }
      }
      useSidePanelStore.getState().openMessenger(channel)
      handleNavigate(`projects/${projectId}`)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside
      className="relative bg-[#f7f7f7] flex-shrink-0 flex flex-col h-full overflow-hidden border-r border-gray-200"
      style={{ width: sidebarWidth }}
    >
      {!isClientOnly && !permissionsLoading && (
        <WorkspacePicker
          workspaces={workspaces}
          currentWorkspace={currentWorkspace}
          workspaceId={workspaceId}
          loadingWorkspaces={loadingWorkspaces}
          isOwner={isOwner}
          canManageSettings={hasPermission('manage_workspace_settings')}
        />
      )}

      <div className="px-2 pb-2">
        <nav className="flex items-center justify-between gap-[1px]">
          <SidebarNavButton
            icon={Home}
            label="Главная"
            href={buildHref('')}
            isActive={isNavActive('')}
            compact
          />
          {!isClientOnly && (hasPermission('view_knowledge_base') || hasPermission('manage_knowledge_base') || hasPermission('manage_templates')) && (
            <SidebarNavButton
              icon={BookOpen}
              label="База знаний"
              href={buildHref('settings/knowledge-base')}
              isActive={isNavActive('settings/knowledge-base')}
              compact
            />
          )}
          {!isClientOnly && hasPermission('manage_participants') && (
            <SidebarNavButton
              icon={Users}
              label="Люди"
              href={buildHref('settings/participants')}
              isActive={isNavActive('settings/participants')}
              compact
            />
          )}
          {!isClientOnly && hasPermission('manage_templates') && (
            <SidebarNavButton
              icon={Layout}
              label="Шаблоны"
              href={buildHref('settings/templates/project-templates')}
              isActive={isNavActive('settings/templates')}
              compact
            />
          )}
          {!isClientOnly && workspaceId && (isOwner || hasPermission('manage_workspace_settings')) && (
            <SidebarNavButton
              icon={Settings}
              label="Настройки"
              href={buildHref('settings')}
              isActive={
                isNavActive('settings') &&
                !isNavActive('settings/participants') &&
                !isNavActive('settings/templates') &&
                !isNavActive('settings/knowledge-base')
              }
              compact
            />
          )}
        </nav>

        {!isClientOnly && (
          <nav className="mt-1.5" style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <SidebarNavButton
              icon={Inbox}
              label="Входящие"
              href={buildHref('inbox')}
              badge={inboxBadge}
              isActive={isNavActive('inbox')}
            />
            <SidebarNavButton
              icon={CheckSquare}
              label="Задачи"
              href={buildHref('tasks')}
              badge={tasksBadge}
              isActive={isNavActive('tasks')}
            />
            <SidebarNavButton
              icon={Kanban}
              label="Доски"
              href={buildHref('boards')}
              isActive={isNavActive('boards') && !searchParams.get('board')}
            />
            {/* Закреплённые доски */}
            {pinnedBoards.map((board) => (
              <div key={board.id} className="group/pin flex items-center">
                <SidebarNavButton
                  icon={Kanban}
                  label={board.name}
                  href={buildHref(`boards?board=${board.id}`)}
                  isActive={isNavActive('boards') && searchParams.get('board') === board.id}
                />
                <button
                  type="button"
                  className="p-0.5 rounded opacity-0 group-hover/pin:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 -ml-6 mr-1 shrink-0"
                  title="Открепить"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    toggleBoardPin(board.id)
                  }}
                >
                  <PinOff className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </nav>
        )}
      </div>

      <div className="flex-1 overflow-hidden px-2 pt-1 relative after:absolute after:inset-x-0 after:bottom-0 after:h-3 after:bg-gradient-to-b after:from-transparent after:to-black/[0.06] after:pointer-events-none">
        <ProjectsList
          projects={projects}
          loading={loadingProjects}
          badgeDisplays={badgeDisplays}
          clientUnreadCounts={clientUnreadCounts}
          internalUnreadCounts={internalUnreadCounts}
          badgeColors={badgeColors}
          activeProjectId={activeProjectId}
          onProjectClick={(projectId) => {
            setOptimisticProjectId(projectId)
            handleNavigate(`projects/${projectId}`)
          }}
          getProjectHref={(projectId) => buildHref(`projects/${projectId}`)}
          onBadgeClick={handleBadgeClick}
          onCreateProject={isClientOnly ? undefined : createProjectDialog.open}
          onTitleClick={() => handleNavigate('projects')}
          isClientOnly={isClientOnly}
          clientTabs={isClientOnly ? displayModules : undefined}
          activeTab={activeTab}
          onTabClick={(projectId, tabId) => handleNavigate(`projects/${projectId}?tab=${tabId}`)}
          workspaceId={workspaceId}
        />
      </div>

      <div className="px-2 py-2 border-t border-gray-200">
        {user && (
          <UserProfile
            user={user}
            onProfileClick={() => router.push('/profile')}
            onSignOut={handleSignOut}
          />
        )}
      </div>

      {/* Resize handle */}
      <div
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20"
        onMouseDown={handleMouseDown}
      />

      <CreateProjectDialog
        open={createProjectDialog.isOpen}
        onOpenChange={(open) => (open ? createProjectDialog.open() : createProjectDialog.close())}
        onSuccess={() => {
          refreshProjects()
          createProjectDialog.close()
        }}
      />
    </aside>
  )
}
