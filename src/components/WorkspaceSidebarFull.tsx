"use client"

/**
 * WorkspaceSidebarFull — полный сайдбар с навигацией, бейджами, входящими и задачами.
 * Состав и порядок верхнего блока (топ-бар иконок + список) задаются настройкой
 * `workspace_sidebar_settings` (страница /workspaces/<id>/settings/sidebar).
 */

import { useEffect, useState, useMemo, startTransition } from 'react'
import { useDebounce } from '@/hooks/shared/useDebounce'
import { PanelLeftClose, X } from 'lucide-react'
import { useParams, useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { QuickActionsProvider } from '@/components/quick-actions/QuickActionsProvider'
import { SidebarSlotsRow } from './WorkspaceSidebar/SidebarSlotsRow'
import { SidebarFavoritesButton } from './WorkspaceSidebar/SidebarFavoritesButton'
import { NotificationMuteButton } from './WorkspaceSidebar/NotificationMuteButton'
import { SidebarGlobalSearch } from './WorkspaceSidebar/SidebarGlobalSearch'
import { ProjectsList } from './WorkspaceSidebar/ProjectsList'
import { SettingsNav } from './WorkspaceSidebar/SettingsNav'
import { UserProfile } from './WorkspaceSidebar/UserProfile'
import { WorkspacePicker } from './WorkspaceSidebar/WorkspacePicker'
import { useSidebarData } from './WorkspaceSidebar/useSidebarData'
import { WorkspaceSidebarCompact } from './WorkspaceSidebar/WorkspaceSidebarCompact'
import { useSidebarResize } from './WorkspaceSidebar/useSidebarResize'
import { useSidebarInboxCounts } from '@/hooks/messenger/useFilteredInbox'
import { supabase } from '@/lib/supabase'
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog'
import { SendFailuresIndicator } from '@/components/messenger/SendFailuresIndicator'
import { useDialog } from '@/hooks/shared/useDialog'
import { openThreadById } from '@/components/tasks/openThreadById'
import { usePinnedBoards } from './WorkspaceSidebar/usePinnedBoards'
import { usePinnedItemLists } from './WorkspaceSidebar/usePinnedItemLists'
import { useBoardsQuery } from '@/components/boards/hooks/useBoardsQuery'
import { useItemLists } from '@/hooks/useItemLists'
import { useSections } from '@/hooks/useSections'
import { useProjectTemplate } from '@/hooks/projects/useProjectData'
import { useProjectModules } from '@/hooks/projects/useProjectModules'
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
  slotRef,
} from '@/lib/sidebarSettings'

type WorkspaceSidebarFullProps = {
  workspaceId?: string
  onCollapse?: () => void
  /** Сжатый режим — только иконки (без выбора воркспейса, проектов, пользователя). */
  compact?: boolean
  /** Кнопка-«развернуть» в сжатом режиме. */
  onExpand?: () => void
  /** Закрыть мобильный выезжающий сайдбар — крестик справа от воркспейс-пикера
   *  (только на мобиле, на месте десктопной кнопки сворачивания). */
  onMobileClose?: () => void
  /** Режим настроек — вместо поиска/проектов показываем меню разделов настроек
   *  (та же обёртка/шапка/низ сайдбара). */
  settingsMode?: boolean
}

export function WorkspaceSidebarFull({
  workspaceId: propsWorkspaceId,
  onCollapse,
  compact = false,
  onExpand,
  onMobileClose,
  settingsMode = false,
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
  const debouncedSearchQuery = useDebounce(rawSearchQuery, 250)

  // Считаем непрочитанные ДО useSidebarData, чтобы прокинуть список проектов с непрочитанными.
  const {
    totalUnread,
    unreadThreadsCount,
    unreadPersonalDialogsCount,
    noProjectBadgeDisplay,
    noProjectBadgeColor,
    noProjectLastActivityAt,
    projectData: projectUnreadData,
  } = useSidebarInboxCounts(workspaceId ?? '')
  // Цвет бейджа «Без проекта» — как у проектов (accent треда). Без этого
  // виртуал брал дефолтный цвет вместо акцента (баг 2026-06-27).
  const badgeColors = useMemo(() => {
    const next = new Map(projectUnreadData.badgeColors)
    if (noProjectBadgeColor) next.set(NO_PROJECT_VIRTUAL_ID, noProjectBadgeColor)
    return next
  }, [projectUnreadData.badgeColors, noProjectBadgeColor])
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
      // Исключаем виртуальный «Без проекта» — это не UUID, а sentinel-маркер;
      // если оставить, он попадёт в `.in('id', ...)` запросе к projects и
      // PostgREST вернёт 400 (не парсится как UUID).
      if (projectId === NO_PROJECT_VIRTUAL_ID) return
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
  // Клик → `/tasks?filter=no_project`. Сортировка — по last_activity_at среди
  // обычных проектов: если в личных диалогах пришло свежее сообщение, виртуал
  // поднимается вверх как обычный проект с новым событием. Если активности
  // нет (noProjectLastActivityAt = null) — кладём в конец.
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
    if (!noProjectLastActivityAt) return [...rawProjects, virtual]
    const virtualMs = Date.parse(noProjectLastActivityAt)
    if (!Number.isFinite(virtualMs)) return [...rawProjects, virtual]
    // rawProjects уже отсортированы БД по last_activity_at desc — ищем первый
    // проект с активностью СТАРШЕ виртуала и вставляем виртуал перед ним.
    const insertIdx = rawProjects.findIndex((p) => {
      const raw = (p as unknown as { last_activity_at: string | null }).last_activity_at
      const pMs = raw ? Date.parse(raw) : Number.NEGATIVE_INFINITY
      return !Number.isFinite(pMs) || pMs < virtualMs
    })
    if (insertIdx === -1) return [...rawProjects, virtual]
    return [...rawProjects.slice(0, insertIdx), virtual, ...rawProjects.slice(insertIdx)]
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
  const { data: allSectionsRaw } = useSections(workspaceId)
  const allSections = useMemo(
    () => (allSectionsRaw ?? []).map((s) => ({ id: s.id, name: s.name })),
    [allSectionsRaw],
  )

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
      // URL может содержать как UUID, так и short_id — резолвим оба варианта
      // через allBoards и проверяем pathname.
      const pinnedBoardUuids = listSlots
        .filter((s) => s.type === 'board')
        .map((s) => boardIdFromSlotId(slotRef(s)))
        .filter((id): id is string => Boolean(id))
      const pinnedBoardPathTokens: string[] = []
      for (const uuid of pinnedBoardUuids) {
        pinnedBoardPathTokens.push(uuid)
        const b = allBoards?.find((x) => x.id === uuid)
        if (b?.short_id != null) pinnedBoardPathTokens.push(String(b.short_id))
      }
      return (
        isNavActive('boards') &&
        !pinnedBoardPathTokens.some((token) => pathname.includes(`/boards/${token}`))
      )
    }
    return isNavActive(meta.path)
  }

  // Слоты, отсортированные по order и отфильтрованные по правам/существованию досок.
  const { topbarSlots, listSlots } = useMemo(() => {
    const slots = sidebarSettings?.slots ?? []
    const accessible = slots.filter((s) => {
      if (s.type === 'nav') {
        const key = navKeyFromSlotId(slotRef(s))
        // Удалённые nav-ключи (напр. упразднённый 'lists') → нет def → слот отбрасываем.
        const def = key ? SIDEBAR_NAV_ITEMS[key] : undefined
        return def ? def.hasAccess(permissionsCtx) : false
      }
      if (s.type === 'board') {
        const boardId = boardIdFromSlotId(slotRef(s))
        return boardId ? Boolean(allBoards?.find((b) => b.id === boardId)) : false
      }
      if (s.type === 'list') {
        const listId = listIdFromSlotId(slotRef(s))
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
    await openThreadById(threadId)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (compact) {
    return (
      <WorkspaceSidebarCompact
        onExpand={onExpand}
        workspaceId={workspaceId}
        currentWorkspace={currentWorkspace}
        topbarSlots={topbarSlots}
        listSlots={listSlots}
        allBoards={allBoards}
        allItemLists={allItemLists}
        allSections={allSections}
        isOwner={isOwner}
        isClientOnly={isClientOnly}
        pathname={pathname}
        buildHref={buildHref}
        computeBadge={computeBadge}
        isNavActive={isNavActive}
        isNavItemActive={isNavItemActive}
        toggleBoardPin={toggleBoardPin}
        toggleListPin={toggleListPin}
      />
    )
  }

  return (
    <aside
      ref={sidebarRef}
      data-workspace-sidebar
      className="relative bg-[#f7f7f7] flex-shrink-0 flex flex-col h-full overflow-hidden border-r border-gray-200"
      style={{ width: sidebarWidth }}
    >
      <QuickActionsProvider workspaceId={workspaceId}>
      {!isClientOnly && !permissionsLoading && (
        <div className={onCollapse || onMobileClose ? 'relative pr-10' : 'relative'}>
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
          {/* Крестик закрытия мобильного drawer — на месте десктопной кнопки
              сворачивания (она `hidden md:flex`, этот — `md:hidden`, не пересекаются). */}
          {onMobileClose && (
            <button
              type="button"
              onClick={onMobileClose}
              aria-label="Закрыть меню"
              title="Закрыть меню"
              className="absolute top-2 right-2 z-10 flex md:hidden items-center justify-center h-8 w-8 rounded-md bg-background border shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {/* Индикатор «N не отправлено» — показывается только при наличии
          незакрытых ошибок отправки у текущего юзера в этом воркспейсе. */}
      <SendFailuresIndicator workspaceId={workspaceId} />

      {settingsMode ? (
        <div className="flex-1 overflow-y-auto px-2 pt-3">
          <SettingsNav onNavigate={onMobileClose} />
        </div>
      ) : (
        <>
          {!isClientOnly && (
            <div className="px-2 pt-2">
              <SidebarGlobalSearch
                workspaceId={workspaceId}
                trailing={
                  <div className="flex items-center gap-0.5">
                    <NotificationMuteButton workspaceId={workspaceId} />
                    <SidebarFavoritesButton workspaceId={workspaceId} />
                  </div>
                }
              />
            </div>
          )}

          <div className="px-2 pt-2 pb-2">
            <SidebarSlotsRow
              slots={topbarSlots}
              compact
              workspaceId={workspaceId}
              allBoards={allBoards}
              allItemLists={allItemLists}
              allSections={allSections}
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
                  workspaceId={workspaceId}
                  allBoards={allBoards}
                  allItemLists={allItemLists}
                  allSections={allSections}
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
              showProjectIcons={sidebarSettings?.showProjectIcons}
              showProjectPrefixes={sidebarSettings?.showProjectPrefixes}
            />
          </div>
        </>
      )}

      <div className="px-2 py-2 border-t border-gray-200">
        {user && (
          <UserProfile
            user={user}
            workspaceId={workspaceId}
            onProfileClick={() => router.push('/profile')}
            onSignOut={handleSignOut}
          />
        )}
      </div>

      {/* Resize handle (только десктоп — на мобиле ширина фиксирована CSS) */}
      <div
        className="hidden md:block absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20"
        onMouseDown={handleMouseDown}
      />

      <CreateProjectDialog
        open={createProjectDialog.isOpen}
        onOpenChange={(open) => (open ? createProjectDialog.open() : createProjectDialog.close())}
        onSuccess={(project) => {
          refreshProjects()
          createProjectDialog.close()
          if (workspaceId) router.push(`/workspaces/${workspaceId}/projects/${project.id}`)
        }}
      />
      </QuickActionsProvider>
    </aside>
  )
}
