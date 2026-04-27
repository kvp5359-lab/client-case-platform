"use client"

/**
 * WorkspaceSidebarFull — полный сайдбар с навигацией, бейджами, входящими и задачами.
 * Состав и порядок верхнего блока (топ-бар иконок + список) задаются настройкой
 * `workspace_sidebar_settings` (страница /workspaces/<id>/settings/sidebar).
 */

import { useEffect, useState, useMemo, startTransition } from 'react'
import { useParams, useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Kanban, PinOff } from 'lucide-react'
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
import { globalOpenThread } from '@/components/tasks/TaskPanelContext'
import { usePinnedBoards } from './WorkspaceSidebar/usePinnedBoards'
import { useBoardsQuery } from '@/components/boards/hooks/useBoardsQuery'
import { useProjectTemplate, useProjectModules } from '@/page-components/ProjectPage/hooks'
import {
  useWorkspaceSidebarSettings,
  useMyTaskCounts,
} from '@/hooks/useWorkspaceSidebarSettings'
import {
  type SidebarNavKey,
  type SidebarSlot,
  type SidebarBadgeMode,
  SIDEBAR_NAV_ITEMS,
  formatBadgeCount,
  navKeyFromSlotId,
  boardIdFromSlotId,
} from '@/lib/sidebarSettings'

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
  useEffect(() => {
    setOptimisticProjectId(urlProjectId)
  }, [urlProjectId])
  const activeProjectId = optimisticProjectId
  const { user } = useAuth()

  const [rawSearchQuery, setRawSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(rawSearchQuery), 250)
    return () => clearTimeout(t)
  }, [rawSearchQuery])

  // Считаем непрочитанные ДО useSidebarData, чтобы прокинуть список проектов с непрочитанными.
  const { totalUnread, unreadThreadsCount, projectData: projectUnreadData } =
    useSidebarInboxCounts(workspaceId ?? '')
  const badgeDisplays = projectUnreadData.badgeDisplays
  const clientUnreadCounts = projectUnreadData.clientUnreadCounts
  const internalUnreadCounts = projectUnreadData.internalUnreadCounts
  const projectThreadIds = projectUnreadData.threadIds
  const badgeColors = projectUnreadData.badgeColors

  const unreadProjectIds = useMemo(() => {
    const ids: string[] = []
    badgeDisplays.forEach((badge, projectId) => {
      if (badge.type !== 'none') ids.push(projectId)
    })
    return ids
  }, [badgeDisplays])

  const {
    workspaces,
    projects,
    loadingWorkspaces,
    loadingProjects,
    currentWorkspace,
    permissionsResult,
    refreshProjects,
  } = useSidebarData({ workspaceId, searchQuery: debouncedSearchQuery, unreadProjectIds })

  const {
    can: hasPermission,
    isOwner,
    isLoading: permissionsLoading,
    isClientOnly: isClientOnlyRaw,
  } = permissionsResult

  const isClientOnly = !permissionsLoading && isClientOnlyRaw

  const { sidebarWidth, sidebarRef, handleMouseDown } = useSidebarResize()

  useEffect(() => {
    if (workspaceId) {
      try { localStorage.setItem('cc:last-workspace-id', workspaceId) } catch { /* ignore */ }
    }
  }, [workspaceId])

  const activeProjectTemplateId = projects.find((p) => p.id === activeProjectId)?.template_id
  const { data: projectTemplate, isLoading: isTemplateLoading } = useProjectTemplate(activeProjectTemplateId)
  const { availableModules, isLoading: isPermissionsLoading } = useProjectModules(activeProjectId, workspaceId, projectTemplate)
  const isTabsLoading = isTemplateLoading || isPermissionsLoading

  const [lastModules, setLastModules] = useState(availableModules)
  useEffect(() => {
    if (!isTabsLoading && availableModules.length > 0) setLastModules(availableModules)
  }, [availableModules, isTabsLoading])
  const displayModules = (!isTabsLoading && availableModules.length > 0) ? availableModules : lastModules
  const activeTab = isClientOnly ? (searchParams.get('tab') || 'documents') : undefined

  const createProjectDialog = useDialog()

  // ── Настройки сайдбара (видимость/порядок + бейджи досок) ────────────────────
  const { data: sidebarSettings } = useWorkspaceSidebarSettings(workspaceId)
  const { data: taskCounts } = useMyTaskCounts(workspaceId)

  // Закреплённые доски — настройка на уровне воркспейса (внутри slots).
  const { togglePin: toggleBoardPin } = usePinnedBoards(workspaceId)
  const { data: allBoards } = useBoardsQuery(workspaceId)

  const buildHref = (path: string) => {
    if (path.startsWith('//') || path.startsWith('/\\')) return '#'
    if (path.startsWith('/')) return path
    if (!workspaceId) return '#'
    return `/workspaces/${workspaceId}/${path}`
  }

  const handleNavigate = (path: string) => {
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

  /** Бейдж по выбранному режиму. Один и тот же набор для пунктов меню и досок. */
  const computeBadge = (mode: SidebarBadgeMode): string | undefined => {
    switch (mode) {
      case 'my_active_tasks':
        return formatBadgeCount(taskCounts?.active)
      case 'all_my_tasks':
        return formatBadgeCount(taskCounts?.all)
      case 'overdue_tasks':
        return formatBadgeCount(taskCounts?.overdue)
      case 'unread_messages':
        return formatBadgeCount(totalUnread)
      case 'unread_threads':
        return formatBadgeCount(unreadThreadsCount)
      case 'disabled':
      default:
        return undefined
    }
  }

  const permissionsCtx = useMemo(
    () => ({ isOwner, isClientOnly, hasPermission }),
    [isOwner, isClientOnly, hasPermission],
  )

  /** Активность для пункта меню — спецслучаи для settings и boards. */
  const isNavItemActive = (key: SidebarNavKey, listSlots: SidebarSlot[]): boolean => {
    const meta = SIDEBAR_NAV_ITEMS[key]
    if (key === 'settings') {
      return (
        isNavActive('settings') &&
        !isNavActive('settings/participants') &&
        !isNavActive('settings/templates') &&
        !isNavActive('settings/knowledge-base')
      )
    }
    if (key === 'boards') {
      // /boards активен, но не внутри закреплённой доски (у неё свой пункт).
      const pinnedBoardIds = listSlots
        .filter((s) => s.type === 'board')
        .map((s) => boardIdFromSlotId(s.id))
        .filter((id): id is string => Boolean(id))
      return (
        isNavActive('boards') &&
        !pinnedBoardIds.some((id) => pathname.includes(`/boards/${id}`))
      )
    }
    return isNavActive(meta.path)
  }

  // Слоты, отсортированные по order и отфильтрованные по правам/существованию досок.
  const { topbarSlots, listSlots } = useMemo(() => {
    const slots = sidebarSettings?.slots ?? []
    const accessible = slots.filter((s) => {
      if (s.type === 'nav') {
        const key = navKeyFromSlotId(s.id)
        return key ? SIDEBAR_NAV_ITEMS[key].hasAccess(permissionsCtx) : false
      }
      // board: проверим, что доска ещё существует
      const boardId = boardIdFromSlotId(s.id)
      return boardId ? Boolean(allBoards?.find((b) => b.id === boardId)) : false
    })
    const sorted = [...accessible].sort((a, b) => a.order - b.order)
    return {
      topbarSlots: sorted.filter((s) => s.placement === 'topbar'),
      listSlots: sorted.filter((s) => s.placement === 'list'),
    }
  }, [sidebarSettings, permissionsCtx, allBoards])

  const handleBadgeClick = async (projectId: string, channel: 'client' | 'internal' = 'client') => {
    void channel
    const threadIdEntry = projectThreadIds?.get(projectId)
    const threadId = channel === 'internal' ? threadIdEntry?.internal : threadIdEntry?.client
    if (!threadId) {
      handleNavigate(`projects/${projectId}`)
      return
    }
    const { data: thread } = await supabase
      .from('project_threads')
      .select(
        'id, name, type, project_id, workspace_id, status_id, deadline, accent_color, icon, is_pinned, created_at, created_by, sort_order',
      )
      .eq('id', threadId)
      .eq('is_deleted', false)
      .maybeSingle()
    if (thread) {
      globalOpenThread({
        id: thread.id,
        name: thread.name,
        type: thread.type as 'chat' | 'task',
        project_id: thread.project_id,
        workspace_id: thread.workspace_id,
        status_id: thread.status_id,
        deadline: thread.deadline,
        accent_color: thread.accent_color,
        icon: thread.icon,
        is_pinned: thread.is_pinned,
        created_at: thread.created_at,
        created_by: thread.created_by,
        sort_order: thread.sort_order ?? 0,
      })
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside
      ref={sidebarRef}
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
        {topbarSlots.length > 0 && (
          <nav className="flex items-center justify-between gap-[1px]">
            {topbarSlots.map((slot) => {
              const badge = computeBadge(slot.badge_mode)
              if (slot.type === 'nav') {
                const key = navKeyFromSlotId(slot.id)!
                const meta = SIDEBAR_NAV_ITEMS[key]
                return (
                  <SidebarNavButton
                    key={slot.id}
                    icon={meta.icon}
                    label={meta.label}
                    href={buildHref(meta.path)}
                    isActive={isNavItemActive(key, listSlots)}
                    badge={badge}
                    compact
                  />
                )
              }
              const boardId = boardIdFromSlotId(slot.id)!
              const board = allBoards?.find((b) => b.id === boardId)
              if (!board) return null
              return (
                <SidebarNavButton
                  key={slot.id}
                  icon={Kanban}
                  label={board.name}
                  href={buildHref(`boards/${board.id}`)}
                  isActive={isNavActive('boards') && pathname.includes(`/boards/${board.id}`)}
                  badge={badge}
                  compact
                />
              )
            })}
          </nav>
        )}

        {!isClientOnly && (
          <nav
            className={topbarSlots.length > 0 ? 'mt-1.5' : ''}
            style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}
          >
            {listSlots.map((slot) => {
              const badge = computeBadge(slot.badge_mode)
              if (slot.type === 'nav') {
                const key = navKeyFromSlotId(slot.id)!
                const meta = SIDEBAR_NAV_ITEMS[key]
                return (
                  <SidebarNavButton
                    key={slot.id}
                    icon={meta.icon}
                    label={meta.label}
                    href={buildHref(meta.path)}
                    badge={badge}
                    isActive={isNavItemActive(key, listSlots)}
                  />
                )
              }
              const boardId = boardIdFromSlotId(slot.id)!
              const board = allBoards?.find((b) => b.id === boardId)
              if (!board) return null
              const hoverSlot = isOwner ? (
                <button
                  type="button"
                  className="p-0.5 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-200/60"
                  title="Открепить"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    toggleBoardPin(board.id)
                  }}
                >
                  <PinOff className="h-[14px] w-[14px]" />
                </button>
              ) : undefined
              return (
                <div key={slot.id} className="group/pin">
                  <SidebarNavButton
                    icon={Kanban}
                    label={board.name}
                    href={buildHref(`boards/${board.id}`)}
                    badge={badge}
                    isActive={isNavActive('boards') && pathname.includes(`/boards/${board.id}`)}
                    hoverIconSlot={hoverSlot}
                  />
                </div>
              )
            })}
          </nav>
        )}
      </div>

      <div className="flex-1 overflow-hidden px-2 pt-1 relative after:absolute after:inset-x-0 after:bottom-0 after:h-3 after:bg-gradient-to-b after:from-transparent after:to-black/[0.06] after:pointer-events-none">
        <ProjectsList
          projects={projects}
          loading={loadingProjects}
          onSearchChange={setRawSearchQuery}
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
