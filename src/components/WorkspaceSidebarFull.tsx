"use client"

/**
 * WorkspaceSidebarFull — полный сайдбар с навигацией, бейджами, входящими и задачами.
 * Состав и порядок верхнего блока (топ-бар иконок + список) задаются настройкой
 * `workspace_sidebar_settings` (страница /workspaces/<id>/settings/sidebar).
 */

import { useEffect, useState, useMemo, startTransition } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useParams, useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { SidebarSlotsRow } from './WorkspaceSidebar/SidebarSlotsRow'
import { ProjectsList } from './WorkspaceSidebar/ProjectsList'
import { UserProfile } from './WorkspaceSidebar/UserProfile'
import { WorkspacePicker } from './WorkspaceSidebar/WorkspacePicker'
import { useSidebarData } from './WorkspaceSidebar/useSidebarData'
import { useSidebarResize } from './WorkspaceSidebar/useSidebarResize'
import { useSidebarInboxCounts } from '@/hooks/messenger/useFilteredInbox'
import { supabase } from '@/lib/supabase'
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog'
import { SendFailuresIndicator } from '@/components/messenger/SendFailuresIndicator'
import { useDialog } from '@/hooks/shared/useDialog'
import { globalOpenThread } from '@/components/tasks/TaskPanelContext'
import { usePinnedBoards } from './WorkspaceSidebar/usePinnedBoards'
import { usePinnedItemLists } from './WorkspaceSidebar/usePinnedItemLists'
import { useBoardsQuery } from '@/components/boards/hooks/useBoardsQuery'
import { useItemLists } from '@/hooks/useItemLists'
import { useProjectTemplate, useProjectModules } from '@/page-components/ProjectPage/hooks'
import { NO_PROJECT_ID as NO_PROJECT_VIRTUAL_ID } from '@/components/tasks/useTaskFilters'
import type { Project } from './WorkspaceSidebar/useSidebarData'
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
  listIdFromSlotId,
} from '@/lib/sidebarSettings'

interface WorkspaceSidebarFullProps {
  workspaceId?: string
  onCollapse?: () => void
  /** Сжатый режим — только иконки (без выбора воркспейса, проектов, пользователя). */
  compact?: boolean
  /** Кнопка-«развернуть» в сжатом режиме. */
  onExpand?: () => void
}

export function WorkspaceSidebarFull({
  workspaceId: propsWorkspaceId,
  onCollapse,
  compact = false,
  onExpand,
}: WorkspaceSidebarFullProps = {}) {
  const router = useRouter()
  const params = useParams<{ workspaceId?: string; projectId?: string }>()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const workspaceId = propsWorkspaceId || params.workspaceId

  // Extract projectId из URL + оптимистичный state для мгновенной анимации.
  // URL содержит short_id (например `/projects/57`), а нам нужен UUID для
  // сравнения с `project.id` в сайдбаре. Резолв short_id → UUID делается ниже,
  // когда подгрузится список проектов.
  const urlProjectSegment = pathname.match(/\/projects\/([^/]+)/)?.[1]
  const [optimisticProjectSegment, setOptimisticProjectSegment] = useState<string | undefined>(urlProjectSegment)
  useEffect(() => {
    setOptimisticProjectSegment(urlProjectSegment)
  }, [urlProjectSegment])
  const { user } = useAuth()

  const [rawSearchQuery, setRawSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(rawSearchQuery), 250)
    return () => clearTimeout(t)
  }, [rawSearchQuery])

  // Считаем непрочитанные ДО useSidebarData, чтобы прокинуть список проектов с непрочитанными.
  const {
    totalUnread,
    unreadThreadsCount,
    unreadPersonalDialogsCount,
    noProjectBadgeDisplay,
    noProjectLastActivityAt,
    projectData: projectUnreadData,
  } = useSidebarInboxCounts(workspaceId ?? '')
  const badgeColors = projectUnreadData.badgeColors
  const clientUnreadCounts = projectUnreadData.clientUnreadCounts
  const internalUnreadCounts = projectUnreadData.internalUnreadCounts
  const projectThreadIds = projectUnreadData.threadIds
  // Подмешиваем badge для виртуальной записи «Без проекта» — чтобы
  // ProjectsList корректно учёл её в сортировке (есть/нет непрочитанных).
  const badgeDisplays = useMemo(() => {
    const next = new Map(projectUnreadData.badgeDisplays)
    next.set(NO_PROJECT_VIRTUAL_ID, noProjectBadgeDisplay)
    return next
  }, [projectUnreadData.badgeDisplays, noProjectBadgeDisplay])

  const unreadProjectIds = useMemo(() => {
    const ids: string[] = []
    badgeDisplays.forEach((badge, projectId) => {
      if (badge.type !== 'none') ids.push(projectId)
    })
    return ids
  }, [badgeDisplays])

  const {
    workspaces,
    projects: rawProjects,
    loadingWorkspaces,
    loadingProjects,
    currentWorkspace,
    permissionsResult,
    refreshProjects,
  } = useSidebarData({ workspaceId, searchQuery: debouncedSearchQuery, unreadProjectIds })

  // Виртуальная запись «Без проекта» — рендерится как обычный проект в списке.
  // Клик → `/tasks?filter=no_project`. Сортировка обеспечена через badgeDisplays
  // (есть непрочитанные → ProjectsList ставит наверх) и last_activity_at.
  const projects: Project[] = useMemo(() => {
    if (!workspaceId) return rawProjects
    const virtual = {
      // Минимально необходимые поля Project (Database.projects.Row + iconId/iconColor).
      // Поля используются только в ProjectListItem для рендера: id/name/iconId/iconColor.
      // Остальное не читается (нет template/status/...), TS требует — заполняем заглушками.
      id: NO_PROJECT_VIRTUAL_ID,
      name: 'Без проекта',
      workspace_id: workspaceId,
      template_id: null,
      status_id: null,
      is_deleted: false,
      created_at: null,
      updated_at: null,
      created_by: null,
      description: null,
      deadline: null,
      short_id: null,
      last_activity_at: noProjectLastActivityAt,
      iconId: 'folder-minus',
      iconColor: '#6b7280',
    } as unknown as Project
    return [...rawProjects, virtual]
  }, [rawProjects, workspaceId, noProjectLastActivityAt])

  // Резолв URL-сегмента (short_id или UUID) в реальный project.id (UUID).
  // URL содержит short_id (например `/projects/57`), но `project.id` в
  // сайдбаре — UUID. Чтобы сравнение в `ProjectListItem` сработало, резолвим
  // через `projects` list. Старые ссылки с UUID — поддерживаются.
  const activeProjectId = useMemo(() => {
    // Спецслучай: страница /tasks?filter=no_project → подсветить виртуал «Без проекта».
    if (pathname.endsWith('/tasks') && searchParams?.get('filter') === 'no_project') {
      return NO_PROJECT_VIRTUAL_ID
    }
    if (!optimisticProjectSegment) return undefined
    if (optimisticProjectSegment.includes('-')) return optimisticProjectSegment
    const asNum = Number(optimisticProjectSegment)
    if (Number.isNaN(asNum)) return optimisticProjectSegment
    return projects.find((p) => p.short_id === asNum)?.id ?? optimisticProjectSegment
  }, [optimisticProjectSegment, projects, pathname, searchParams])

  const {
    can: hasPermission,
    isOwner,
    isLoading: permissionsLoading,
    isClientOnly: isClientOnlyRaw,
  } = permissionsResult

  const isClientOnly = !permissionsLoading && isClientOnlyRaw

  const { sidebarWidth, sidebarRef, handleMouseDown } = useSidebarResize()

  // CSS-переменная с актуальной шириной сайдбара — нужна для позиционирования
  // плавающей кнопки сворачивания/разворачивания в WorkspaceLayout.
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`)
  }, [sidebarWidth])

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
  const { togglePin: toggleListPin } = usePinnedItemLists(workspaceId)
  const { data: allBoards } = useBoardsQuery(workspaceId)
  const { data: allItemLists } = useItemLists(workspaceId)

  // Сохраняем legacy-формат /workspaces/<uuid>/... для совместимости с localhost-разработкой.
  // На production-поддоменах proxy сам редиректит /workspaces/<uuid>/<path> → чистый /<path>
  // (через 307 + URL rewrite), плюс делает обратный rewrite короткого URL обратно на полный.
  // На localhost (нет proxy с резолвом host'а) URL остаётся в полной форме — это нормально для dev.
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
    // Также сравниваем с короткой формой (на subdomain proxy показывает /<path>)
    const shortPath = `/${href}`
    if (href === '') {
      return (
        pathname === fullPath ||
        pathname === `/workspaces/${workspaceId}` ||
        pathname === '/' ||
        pathname === ''
      )
    }
    return (
      pathname.startsWith(fullPath) ||
      pathname === shortPath ||
      pathname.startsWith(shortPath + '/') ||
      pathname.startsWith(shortPath + '?')
    )
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
      case 'unread_personal_dialogs':
        return formatBadgeCount(unreadPersonalDialogsCount)
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
    if (key === 'lists') {
      // /lists активен, но не внутри закреплённого списка (у него свой пункт).
      const pinnedListIds = listSlots
        .filter((s) => s.type === 'list')
        .map((s) => listIdFromSlotId(s.id))
        .filter((id): id is string => Boolean(id))
      return (
        isNavActive('lists') &&
        !pinnedListIds.some((id) => pathname.includes(`/lists/${id}`))
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
      if (s.type === 'board') {
        const boardId = boardIdFromSlotId(s.id)
        return boardId ? Boolean(allBoards?.find((b) => b.id === boardId)) : false
      }
      if (s.type === 'list') {
        const listId = listIdFromSlotId(s.id)
        return listId ? Boolean(allItemLists?.find((l) => l.id === listId)) : false
      }
      // type === 'folder' — папки доступны всегда (дочерние элементы фильтруются по доступу выше).
      return true
    })
    const sorted = [...accessible].sort((a, b) => a.order - b.order)
    return {
      topbarSlots: sorted.filter((s) => s.placement === 'topbar'),
      listSlots: sorted.filter((s) => s.placement === 'list'),
    }
  }, [sidebarSettings, permissionsCtx, allBoards, allItemLists])

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

  if (compact) {
    const wsName = currentWorkspace?.name ?? ''
    return (
      <aside
        data-workspace-sidebar
        className="relative bg-[#f7f7f7] flex-shrink-0 flex flex-col h-full overflow-hidden border-r border-gray-200 w-12"
      >
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={onExpand}
            aria-label="Развернуть сайдбар"
            title="Развернуть сайдбар"
            className="flex items-center justify-center h-8 w-8 rounded-md bg-background border shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <PanelLeftOpen size={14} />
          </button>
        </div>
        <div className="flex justify-center pt-2">
          {currentWorkspace && (
            <div
              className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium"
              title={wsName}
            >
              {wsName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="px-1 pt-1 pb-2 flex flex-col gap-1.5 overflow-y-auto">
          <SidebarSlotsRow
            slots={topbarSlots}
            compact
            direction="column"
            allBoards={allBoards}
            allItemLists={allItemLists}
            isOwner={isOwner}
            pathname={pathname}
            buildHref={buildHref}
            computeBadge={computeBadge}
            isNavActive={isNavActive}
            isNavItemActive={isNavItemActive}
            listSlots={listSlots}
            toggleBoardPin={toggleBoardPin}
            toggleListPin={toggleListPin}
          />
          {!isClientOnly && topbarSlots.length > 0 && listSlots.length > 0 && (
            <div className="mx-2 h-px bg-gray-300/70" />
          )}
          {!isClientOnly && (
            <SidebarSlotsRow
              slots={listSlots}
              compact
              direction="column"
              allBoards={allBoards}
              allItemLists={allItemLists}
              isOwner={isOwner}
              pathname={pathname}
              buildHref={buildHref}
              computeBadge={computeBadge}
              isNavActive={isNavActive}
              isNavItemActive={isNavItemActive}
              listSlots={listSlots}
              toggleBoardPin={toggleBoardPin}
              toggleListPin={toggleListPin}
            />
          )}
        </div>
      </aside>
    )
  }

  return (
    <aside
      ref={sidebarRef}
      data-workspace-sidebar
      className="relative bg-[#f7f7f7] flex-shrink-0 flex flex-col h-full overflow-hidden border-r border-gray-200"
      style={{ width: sidebarWidth }}
    >
      {!isClientOnly && !permissionsLoading && (
        <div className={onCollapse ? 'relative pr-10' : 'relative'}>
          <WorkspacePicker
            workspaces={workspaces}
            currentWorkspace={currentWorkspace}
            workspaceId={workspaceId}
            loadingWorkspaces={loadingWorkspaces}
            isOwner={isOwner}
            canManageSettings={hasPermission('manage_workspace_settings')}
          />
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Свернуть сайдбар"
              title="Свернуть сайдбар"
              className="absolute top-2 right-2 z-10 hidden md:flex items-center justify-center h-8 w-8 rounded-md bg-background border shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <PanelLeftClose size={14} />
            </button>
          )}
        </div>
      )}

      {/* Индикатор «N не отправлено» — показывается только при наличии
          незакрытых ошибок отправки у текущего юзера в этом воркспейсе. */}
      <SendFailuresIndicator workspaceId={workspaceId} />

      <div className="px-2 pb-2">
        <SidebarSlotsRow
          slots={topbarSlots}
          compact
          allBoards={allBoards}
          allItemLists={allItemLists}
          isOwner={isOwner}
          pathname={pathname}
          buildHref={buildHref}
          computeBadge={computeBadge}
          isNavActive={isNavActive}
          isNavItemActive={isNavItemActive}
          listSlots={listSlots}
          toggleBoardPin={toggleBoardPin}
          toggleListPin={toggleListPin}
        />

        {!isClientOnly && (
          <div className={topbarSlots.length > 0 ? 'mt-1.5' : ''}>
            <SidebarSlotsRow
              slots={listSlots}
              compact={false}
              allBoards={allBoards}
              allItemLists={allItemLists}
              isOwner={isOwner}
              pathname={pathname}
              buildHref={buildHref}
              computeBadge={computeBadge}
              isNavActive={isNavActive}
              isNavItemActive={isNavItemActive}
              listSlots={listSlots}
              toggleBoardPin={toggleBoardPin}
              toggleListPin={toggleListPin}
            />
          </div>
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
            // Виртуальная запись «Без проекта» → /tasks?filter=no_project
            if (projectId === NO_PROJECT_VIRTUAL_ID) {
              handleNavigate('tasks?filter=no_project')
              return
            }
            setOptimisticProjectSegment(projectId)
            handleNavigate(`projects/${projectId}`)
          }}
          getProjectHref={(projectId) =>
            projectId === NO_PROJECT_VIRTUAL_ID
              ? buildHref('tasks?filter=no_project')
              : buildHref(`projects/${projectId}`)
          }
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
