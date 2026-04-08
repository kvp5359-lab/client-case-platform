"use client"

import { memo } from 'react'
import Link from 'next/link'
import { FolderOpen, ChevronRight, ChevronDown, Pin, PinOff } from 'lucide-react'
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'
import type { Database } from '@/types/database'
import type { ModuleDefinition } from '@/page-components/ProjectPage/moduleRegistry'
import type { BadgeDisplay } from '@/utils/inboxUnread'
import { formatBadgeCount } from '@/utils/inboxUnread'
import { getBadgeClasses, getStatusIconColor, FOLDER_ICON_COLOR } from './projectListConstants'

type Project = Database['public']['Tables']['projects']['Row']

export interface ProjectListItemProps {
  project: Project
  badgeDisplays?: Map<string, BadgeDisplay>
  clientUnreadCounts?: Map<string, number>
  internalUnreadCounts?: Map<string, number>
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
  isPinned,
  togglePin,
}: ProjectListItemProps) {
  const badge = badgeDisplays?.get(project.id) ?? { type: 'none' as const }
  const hasClientUnread = clientUnreadCounts?.has(project.id) ?? false
  const hasInternalUnread = internalUnreadCounts?.has(project.id) ?? false
  const badgeChannel: 'client' | 'internal' =
    !hasClientUnread && hasInternalUnread ? 'internal' : 'client'
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
      className={`group/item relative border rounded-[6px] px-0 py-0 transition-all duration-150 ease-out ${
        showTabs
          ? 'border-gray-200 bg-gray-50/40 shadow-[0_0_8px_rgba(0,0,0,0.12)]'
          : 'border-transparent bg-transparent shadow-none'
      }`}
    >
      <Link
        href={getProjectHref ? getProjectHref(project.id) : '#'}
        onClick={() => onProjectClick(project.id)}
        className={`w-full flex items-center gap-2 px-2 h-[30px] text-[14px] rounded-[6px] transition-colors font-medium ${
          isActive
            ? showTabs
              ? 'text-gray-900'
              : 'bg-gray-200 text-gray-900'
            : 'text-gray-700 hover:bg-gray-100/50'
        }`}
      >
        <span className="relative shrink-0 w-[22px] h-[22px] flex items-center justify-center">
          {isPinned ? (
            <Pin
              className="h-[18px] w-[18px] group-hover/item:opacity-0 transition-opacity"
              style={{ color: FOLDER_ICON_COLOR }}
            />
          ) : (
            <FolderOpen
              className="h-[18px] w-[18px] group-hover/item:opacity-0 transition-opacity"
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
              <PinOff className="h-[14px] w-[14px] text-gray-500 hover:text-gray-700" />
            ) : (
              <Pin className="h-[14px] w-[14px] text-gray-400 hover:text-gray-600" />
            )}
          </button>
        </span>
        <span className="flex-1 text-left truncate">{project.name}</span>
        {badge.type === 'number' ? (
          <span
            role={onBadgeClick ? 'button' : undefined}
            tabIndex={onBadgeClick ? 0 : undefined}
            aria-label={onBadgeClick ? `${badge.value} непрочитанных` : undefined}
            onClick={
              onBadgeClick
                ? (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onBadgeClick(project.id, badgeChannel)
                  }
                : undefined
            }
            className={`ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-white text-[11px] font-bold px-1 ${getBadgeClasses(badgeColor, !!onBadgeClick)}`}
          >
            {formatBadgeCount(badge.value)}
          </span>
        ) : badge.type === 'emoji' ? (
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
            className={`ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[11px] leading-none ${getBadgeClasses(badgeColor, !!onBadgeClick)}`}
          >
            {badge.value}
          </span>
        ) : badge.type === 'dot' ? (
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
            className={`ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full ${getBadgeClasses(badgeColor, !!onBadgeClick)}`}
          />
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
            <nav className="ml-[30px] mt-0.5 mb-0.5" style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {visibleTabs.map((tab) => {
                const Icon = tab.icon
                const isTabActive = showTabs && activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    tabIndex={showTabs ? 0 : -1}
                    onClick={() => onTabClick?.(project.id, tab.id)}
                    className={`w-full flex items-center gap-2 px-2 h-[30px] text-[14px] rounded-[6px] transition-colors font-medium ${
                      isTabActive
                        ? 'bg-gray-200 text-gray-900'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-[16px] w-[16px] shrink-0" />
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
