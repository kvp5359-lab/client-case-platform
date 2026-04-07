"use client"

/**
 * ProjectsList — список проектов в WorkspaceSidebar
 * Отображает отфильтрованные проекты с возможностью навигации
 * Поддерживает закреплённые проекты (pinned) — хранятся в БД (pinned_projects)
 */

import { memo, useState, useRef, useEffect, useMemo } from 'react'
import { Search, X, Plus } from 'lucide-react'
import type { Database } from '@/types/database'
import type { ModuleDefinition } from '@/page-components/ProjectPage/moduleRegistry'
import type { BadgeDisplay } from '@/utils/inboxUnread'
import { usePinnedProjects } from './usePinnedProjects'
import { useFlipAnimation } from './useFlipAnimation'
import { ProjectListItem } from './ProjectListItem'

type Project = Database['public']['Tables']['projects']['Row']

export interface ProjectsListProps {
  projects: Project[]
  loading: boolean
  searchQuery?: string
  badgeDisplays?: Map<string, BadgeDisplay>
  clientUnreadCounts?: Map<string, number>
  internalUnreadCounts?: Map<string, number>
  badgeColors?: Map<string, string>
  activeProjectId?: string
  onProjectClick: (projectId: string) => void
  getProjectHref?: (projectId: string) => string
  onBadgeClick?: (projectId: string, channel?: 'client' | 'internal') => void
  onCreateProject?: () => void
  onTitleClick?: () => void
  onShowAll?: () => void
  isClientOnly?: boolean
  clientTabs?: ModuleDefinition[]
  activeTab?: string
  onTabClick?: (projectId: string, tabId: string) => void
  workspaceId?: string
}

export const ProjectsList = memo(function ProjectsList({
  projects,
  loading,
  searchQuery: externalSearchQuery,
  badgeDisplays,
  clientUnreadCounts,
  internalUnreadCounts,
  badgeColors,
  activeProjectId,
  onProjectClick,
  getProjectHref,
  onBadgeClick,
  onCreateProject,
  onTitleClick,
  onShowAll,
  isClientOnly,
  clientTabs,
  activeTab,
  onTabClick,
  workspaceId,
}: ProjectsListProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [localSearchQuery, setLocalSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLElement>(null)

  const { pinnedIds, togglePin, isPinned } = usePinnedProjects(workspaceId)

  const searchQuery = externalSearchQuery ?? localSearchQuery

  const filteredProjects = useMemo(
    () =>
      projects.filter((project) =>
        project.name.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [projects, searchQuery],
  )

  // Разделение на закреплённые и обычные
  const { pinnedProjects, unpinnedProjects } = useMemo(() => {
    const pinned: Project[] = []
    const unpinned: Project[] = []
    for (const project of filteredProjects) {
      if (pinnedIds.includes(project.id)) {
        pinned.push(project)
      } else {
        unpinned.push(project)
      }
    }
    pinned.sort((a, b) => pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id))
    return { pinnedProjects: pinned, unpinnedProjects: unpinned }
  }, [filteredProjects, pinnedIds])

  // FLIP-анимация при изменении порядка проектов
  const projectIds = useMemo(() => filteredProjects.map((p) => p.id).join(','), [filteredProjects])
  useFlipAnimation(listRef, [projectIds])

  // Фокус на поле при открытии
  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus()
    }
  }, [isSearchOpen])

  const handleOpenSearch = () => {
    setIsSearchOpen(true)
    setLocalSearchQuery('')
  }

  const handleCloseSearch = () => {
    setIsSearchOpen(false)
    setLocalSearchQuery('')
  }

  // sharedItemProps стабилизирован через useMemo — иначе memo у ProjectListItem бесполезен:
  // shallow compare на каждый рендер видел бы новую ссылку объекта, все карточки ререндерились
  // при любом realtime-событии.
  const sharedItemProps = useMemo(
    () => ({
      badgeDisplays,
      clientUnreadCounts,
      internalUnreadCounts,
      badgeColors,
      activeProjectId,
      onProjectClick,
      getProjectHref,
      onBadgeClick,
      isClientOnly,
      clientTabs,
      activeTab,
      onTabClick,
      togglePin,
    }),
    [
      badgeDisplays,
      clientUnreadCounts,
      internalUnreadCounts,
      badgeColors,
      activeProjectId,
      onProjectClick,
      getProjectHref,
      onBadgeClick,
      isClientOnly,
      clientTabs,
      activeTab,
      onTabClick,
      togglePin,
    ],
  )

  return (
    <div className="group/projects flex flex-col h-full min-h-0">
      {/* Заголовок «Проекты» с поиском и кнопкой добавления */}
      <div className="flex items-center justify-between px-2 h-[30px] shrink-0">
        {isSearchOpen ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={localSearchQuery}
              onChange={(e) => setLocalSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') handleCloseSearch()
              }}
              placeholder="Найти проект..."
              className="flex-1 min-w-0 text-xs bg-transparent border-none outline-none text-gray-700 placeholder:text-gray-400"
            />
            <button
              type="button"
              onClick={handleCloseSearch}
              className="p-0.5 rounded hover:bg-gray-200 shrink-0"
              aria-label="Закрыть поиск"
            >
              <X className="h-3 w-3 text-gray-400" />
            </button>
          </div>
        ) : (
          <>
            {onTitleClick ? (
              <button
                type="button"
                onClick={onTitleClick}
                className="text-[12px] text-gray-500 font-medium hover:text-gray-800 transition-colors"
              >
                Проекты
              </button>
            ) : (
              <p className="text-[12px] text-gray-500 font-medium">Проекты</p>
            )}
            <div className="flex items-center gap-0.5 opacity-0 group-hover/projects:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={handleOpenSearch}
                className="p-0.5 rounded hover:bg-gray-200"
                title="Поиск проектов"
                aria-label="Поиск проектов"
              >
                <Search className="h-3.5 w-3.5 text-gray-500" />
              </button>
              {onCreateProject && (
                <button
                  type="button"
                  onClick={onCreateProject}
                  className="p-0.5 rounded hover:bg-gray-200"
                  title="Создать проект"
                  aria-label="Создать проект"
                >
                  <Plus className="h-3.5 w-3.5 text-gray-500" />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Закреплённые проекты */}
      {pinnedProjects.length > 0 && (
        <>
          <div className="px-0 shrink-0" style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {pinnedProjects.map((project) => (
              <ProjectListItem
                key={project.id}
                project={project}
                isPinned={isPinned(project.id)}
                {...sharedItemProps}
              />
            ))}
          </div>
          <div className="mx-3 my-1.5 border-t border-gray-200 shrink-0" />
        </>
      )}

      {/* Список проектов */}
      <nav
        ref={listRef}
        className="flex-1 overflow-y-auto px-1 -mx-1 scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}
      >
        {loading ? (
          <div className="px-2 py-2 text-sm text-muted-foreground">Загрузка...</div>
        ) : unpinnedProjects.length === 0 && pinnedProjects.length === 0 ? (
          <div className="px-2 py-2 text-sm text-muted-foreground">
            {projects.length === 0 ? 'Нет проектов' : 'Проекты не найдены'}
          </div>
        ) : (
          unpinnedProjects.map((project) => (
            <ProjectListItem
              key={project.id}
              project={project}
              isPinned={isPinned(project.id)}
              {...sharedItemProps}
            />
          ))
        )}
      </nav>

      {onShowAll && filteredProjects.length > 0 && (
        <div className="shrink-0 relative -mx-2 px-2 before:absolute before:inset-x-0 before:top-0 before:h-3 before:-translate-y-full before:bg-gradient-to-t before:from-black/[0.06] before:to-transparent before:pointer-events-none">
          <button
            type="button"
            onClick={onShowAll}
            className="w-full px-2 py-2 mt-1 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100/50 rounded-md transition-colors text-left"
          >
            Ещё...
          </button>
        </div>
      )}
    </div>
  )
})
