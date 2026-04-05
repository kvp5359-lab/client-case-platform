"use client"

import { memo } from 'react'
import Link from 'next/link'
import { FolderOpen, ChevronRight, ChevronDown, Pin, PinOff } from 'lucide-react'
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'
import type { Database } from '@/types/database'
import type { ModuleDefinition } from '@/page-components/ProjectPage/moduleRegistry'
import { getBadgeClasses, getStatusIconColor, FOLDER_ICON_COLOR } from './projectListConstants'

type Project = Database['public']['Tables']['projects']['Row']

export interface ProjectListItemProps {
  project: Project
  unreadCounts?: Map<string, number>
  clientUnreadCounts?: Map<string, number>
  internalUnreadCounts?: Map<string, number>
  reactionEmojis?: Map<string, string>
  reactionOnlyProjects?: Set<string>
  badgeColors?: Map<string, string>
  activeProjectId?: string
  onProjectClick: (projectId: string) => void
  getProjectHref?: (projectId: string) => string
  onBadgeClick?: (projectId: string, channel?: 'client' | 'internal') => void
  isClientOnly?: boolean
  clientTabs?: ModuleDefinition[]
  activeTab?: string
  onTabClick?: (projectId: string, tabId: string) => void
  isPinned: boolean
  togglePin: (projectId: string) => void
}

export const ProjectListItem = memo(function ProjectListItem({
  project,
  unreadCounts,
  clientUnreadCounts,
  internalUnreadCounts,
  reactionEmojis,
  reactionOnlyProjects,
  badgeColors,
  activeProjectId,
  onProjectClick,
  getProjectHref,
  onBadgeClick,
  isClientOnly,
  clientTabs,
  activeTab,
  onTabClick,
  isPinned,
  togglePin,
}: ProjectListItemProps) {
  const unread = unreadCounts?.get(project.id)
  const hasClientUnread = clientUnreadCounts?.has(project.id) ?? false
  const internalUnread = internalUnreadCounts?.has(project.id) ?? false
  const badgeChannel: 'client' | 'internal' =
    !hasClientUnread && internalUnread ? 'internal' : 'client'
  const badgeColor = badgeColors?.get(project.id)
  const isActive = project.id === activeProjectId
  // В клиентском режиме обёртка вкладок рендерится всегда (у всех проектов),
  // чтобы работала CSS-анимация сворачивания/разворачивания через grid-rows.
  const hasTabsWrapper = Boolean(isClientOnly && clientTabs && clientTabs.length > 0)
  const showTabs = hasTabsWrapper && isActive
  const visibleTabs = clientTabs?.filter((m) => m.showTab !== false)

  return (
    <div
      data-project-id={project.id}
      className={`group/item relative border rounded-md p-1 transition-colors ${
        showTabs
          ? 'border-gray-200 bg-gray-50/40'
          : 'border-transparent bg-transparent'
      }`}
    >
      <Link
        href={getProjectHref ? getProjectHref(project.id) : '#'}
        onClick={() => onProjectClick(project.id)}
        className={`w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md transition-colors ${
          isActive
            ? showTabs
              ? 'text-gray-900 font-semibold'
              : 'bg-gray-200 text-gray-900 font-semibold'
            : 'text-gray-700 hover:bg-gray-100/50'
        }`}
      >
        <span className="relative shrink-0">
          {isPinned ? (
            <Pin
              className="h-4 w-4 group-hover/item:opacity-0 transition-opacity"
              style={{ color: FOLDER_ICON_COLOR }}
            />
          ) : (
            <FolderOpen
              className="h-4 w-4 group-hover/item:opacity-0 transition-opacity"
              style={{ color: getStatusIconColor(project.status) }}
            />
          )}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              togglePin(project.id)
            }}
            title={isPinned ? 'Открепить' : 'Закрепить'}
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity"
          >
            {isPinned ? (
              <PinOff className="h-3.5 w-3.5 text-gray-500 hover:text-gray-700" />
            ) : (
              <Pin className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
            )}
          </button>
        </span>
        <span className="flex-1 text-left truncate">{project.name}</span>
        {unread && unread > 0 && reactionOnlyProjects?.has(project.id) ? (
          <span
            role={onBadgeClick ? 'button' : undefined}
            tabIndex={onBadgeClick ? 0 : undefined}
            aria-label={onBadgeClick ? 'Непрочитанные сообщения' : undefined}
            onClick={
              onBadgeClick
                ? (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onBadgeClick(project.id, badgeChannel)
                  }
                : undefined
            }
            className={`ml-auto min-w-5 h-5 flex items-center justify-center rounded-full text-[11px] leading-none ${getBadgeClasses(badgeColor, !!onBadgeClick)}`}
          >
            {reactionEmojis?.get(project.id)}
          </span>
        ) : unread && unread > 0 ? (
          <span
            role={onBadgeClick ? 'button' : undefined}
            tabIndex={onBadgeClick ? 0 : undefined}
            aria-label={onBadgeClick ? `${unread} непрочитанных` : undefined}
            onClick={
              onBadgeClick
                ? (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onBadgeClick(project.id, badgeChannel)
                  }
                : undefined
            }
            className={`ml-auto min-w-5 h-5 flex items-center justify-center rounded-full text-white text-[10px] font-bold px-1.5 ${getBadgeClasses(badgeColor, !!onBadgeClick)}`}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : unread === -1 ? (
          <span
            role={onBadgeClick ? 'button' : undefined}
            tabIndex={onBadgeClick ? 0 : undefined}
            aria-label={onBadgeClick ? 'Непрочитанные сообщения' : undefined}
            onClick={
              onBadgeClick
                ? (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onBadgeClick(project.id, badgeChannel)
                  }
                : undefined
            }
            className={`ml-auto min-w-5 h-5 flex items-center justify-center rounded-full ${getBadgeClasses(badgeColor, !!onBadgeClick)}`}
          >
            {reactionEmojis?.get(project.id) && (
              <span className="text-[10px] leading-none">{reactionEmojis.get(project.id)}</span>
            )}
          </span>
        ) : isActive && isClientOnly ? (
          <ChevronDown className="h-3 w-3 text-gray-400" />
        ) : (
          <ChevronRight className="h-3 w-3 text-gray-400" />
        )}
      </Link>
      {/* Вкладки проекта для клиента — анимированное раскрытие через Radix Collapsible. */}
      {hasTabsWrapper && visibleTabs && (
        <CollapsiblePrimitive.Root open={showTabs}>
          <CollapsiblePrimitive.Content data-slot="sidebar-tabs-collapsible">
            <nav className="ml-4 mt-1 mb-0.5 space-y-0.5">
              {visibleTabs.map((tab) => {
                const Icon = tab.icon
                const isTabActive = showTabs && activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    tabIndex={showTabs ? 0 : -1}
                    onClick={() => onTabClick?.(project.id, tab.id)}
                    className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-sm rounded-md transition-colors ${
                      isTabActive
                        ? 'bg-gray-200 text-gray-900 font-semibold'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </button>
                )
              })}
            </nav>
          </CollapsiblePrimitive.Content>
        </CollapsiblePrimitive.Root>
      )}
    </div>
  )
})
