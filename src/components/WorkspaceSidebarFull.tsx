"use client"

/**
 * WorkspaceSidebarFull — полный сайдбар с навигацией, бейджами, входящими и задачами.
 * Мигрирован из WorkspaceSidebar.tsx оригинального ClientCase.
 */

import { useEffect, useRef } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Home, Inbox, CheckSquare, Users, Layout, Settings, BookOpen } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { SidebarNavButton } from './WorkspaceSidebar/SidebarNavButton'
import { ProjectsList } from './WorkspaceSidebar/ProjectsList'
import { UserProfile } from './WorkspaceSidebar/UserProfile'
import { WorkspacePicker } from './WorkspaceSidebar/WorkspacePicker'
import { useSidebarData } from './WorkspaceSidebar/useSidebarData'
import { useSidebarResize } from './WorkspaceSidebar/useSidebarResize'
import {
  useTotalFilteredUnreadCount,
  useProjectFilteredUnreadCounts,
} from '@/hooks/messenger/useFilteredInbox'
import { inboxKeys, sidebarKeys } from '@/hooks/queryKeys'
import { supabase } from '@/lib/supabase'
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog'
import { useDialog } from '@/hooks/shared/useDialog'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { SYSTEM_WORKSPACE_ROLES } from '@/types/permissions'
import { useProjectData, useProjectModules } from '@/page-components/ProjectPage/hooks'
import type { WorkspacePermission } from '@/types/permissions'

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
  const workspaceId = propsWorkspaceId || params.workspaceId

  // Extract projectId from URL
  const activeProjectId = pathname.match(/\/projects\/([^/]+)/)?.[1]
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

  // Вкладки активного проекта для клиентского режима
  const { projectTemplate } = useProjectData(activeProjectId)
  const { availableModules } = useProjectModules(activeProjectId, workspaceId, projectTemplate)
  // Активная вкладка из URL
  const searchParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams()
  const activeTab = isClientOnly ? (searchParams.get('tab') || 'documents') : undefined

  const createProjectDialog = useDialog()
  const { data: totalUnread } = useTotalFilteredUnreadCount(workspaceId ?? '')
  const { data: projectUnreadData } = useProjectFilteredUnreadCounts(workspaceId ?? '')
  const projectUnreadCounts = projectUnreadData?.unreadCounts
  const clientUnreadCounts = projectUnreadData?.clientUnreadCounts
  const internalUnreadCounts = projectUnreadData?.internalUnreadCounts
  const reactionEmojis = projectUnreadData?.reactionEmojis
  const reactionOnlyProjects = projectUnreadData?.reactionOnlyProjects
  const projectThreadIds = projectUnreadData?.threadIds
  const badgeColors = projectUnreadData?.badgeColors

  const inboxBadge =
    totalUnread && totalUnread > 0 ? (totalUnread > 99 ? '99+' : String(totalUnread)) : undefined
  const { data: urgentTasksCount } = useMyUrgentTasksCount(workspaceId)
  const tasksBadge =
    urgentTasksCount && urgentTasksCount > 0
      ? urgentTasksCount > 99 ? '99+' : String(urgentTasksCount)
      : undefined

  // Realtime: обновлять счётчики при новом сообщении
  const queryClient = useQueryClient()
  const instanceId = useRef(Math.random().toString(36).slice(2))
  useEffect(() => {
    if (!workspaceId) return
    const channelName = `sidebar-unread:${workspaceId}:${instanceId.current}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
          queryClient.invalidateQueries({ queryKey: inboxKeys.threadsV2(workspaceId) })
          queryClient.invalidateQueries({ queryKey: sidebarKeys.projectsBase(workspaceId) })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId, queryClient])

  const buildHref = (path: string) => {
    if (path.startsWith('/')) return path
    if (!workspaceId) return '#'
    return `/workspaces/${workspaceId}/${path}`
  }

  const handleNavigate = (path: string) => {
    router.push(buildHref(path))
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

      <div className="px-2 py-2">
        <nav className="flex items-center justify-between">
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
          <nav className="mt-1.5 space-y-0.5">
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
          </nav>
        )}
      </div>

      <div className="flex-1 overflow-hidden px-2 pt-1 relative after:absolute after:inset-x-0 after:bottom-0 after:h-3 after:bg-gradient-to-b after:from-transparent after:to-black/[0.06] after:pointer-events-none">
        <ProjectsList
          projects={projects}
          loading={loadingProjects}
          unreadCounts={projectUnreadCounts}
          clientUnreadCounts={clientUnreadCounts}
          internalUnreadCounts={internalUnreadCounts}
          reactionEmojis={reactionEmojis}
          reactionOnlyProjects={reactionOnlyProjects}
          badgeColors={badgeColors}
          activeProjectId={activeProjectId}
          onProjectClick={(projectId) => handleNavigate(`projects/${projectId}`)}
          getProjectHref={(projectId) => buildHref(`projects/${projectId}`)}
          onBadgeClick={handleBadgeClick}
          onCreateProject={isClientOnly ? undefined : createProjectDialog.open}
          onTitleClick={() => handleNavigate('projects')}
          isClientOnly={isClientOnly}
          clientTabs={isClientOnly ? availableModules : undefined}
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
