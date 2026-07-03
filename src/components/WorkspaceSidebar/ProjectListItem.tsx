"use client"

import { memo, createElement } from 'react'
import Link from 'next/link'
import { ChevronRight, ChevronDown, Pin, PinOff } from 'lucide-react'
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'
import type { ModuleDefinition } from '@/lib/projectModuleRegistry'
import type { BadgeDisplay } from '@/utils/inboxUnread'
import { formatBadgeCount } from '@/utils/inboxUnread'
import { getBadgeClasses } from './projectListConstants'
import { getProjectIcon } from '@/components/common/project-icons'
import { safeCssColor } from '@/utils/isValidCssColor'
import { ACTIVE_NAV_ITEM_CLASS } from '@/lib/sidebarTokens'
import type { Project } from './useSidebarData'

/**
 * Дефолтный серый цвет для иконки проекта без статуса.
 * Тон совпадает с muted-foreground (Tailwind gray-500).
 */
const DEFAULT_ICON_COLOR = '#6B7280'

export type ProjectListItemProps = {
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
  /** Показывать иконку проекта (дефолт true). */
  showProjectIcons?: boolean
  /** Показывать префикс названия проекта (дефолт true). */
  showProjectPrefixes?: boolean
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
  showProjectIcons,
  showProjectPrefixes,
}: ProjectListItemProps) {
  const showIcons = showProjectIcons !== false
  const showPrefixes = showProjectPrefixes !== false
  // Иконка и её цвет уже посчитаны в useSidebarData: см. там логику по
  // template.icon_color_mode ('status' → цвет статуса с fallback в чёрный,
  // 'fixed' → template.icon_color). Если у проекта нет шаблона — серый дефолт.
  // Закреплённые проекты сохраняют визуальное отличие — иконка Pin.
  // createElement используем, чтобы линтер не считал это «созданием компонента
  // на рендере» — мы лишь выбираем существующий Lucide-компонент из мапы.
  const iconColor = safeCssColor(project.iconColor || DEFAULT_ICON_COLOR)
  // Размер 16px и тонкий strokeWidth=1.5 — компактный визуал в стиле Resend.
  const projectIconNode = createElement(getProjectIcon(project.iconId), {
    className: 'h-[14px] w-[14px] group-hover/item:opacity-0 transition-opacity',
    strokeWidth: 1.5,
    style: { color: iconColor },
  })

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
      className={`group/item relative border rounded-[6px] transition-all duration-150 ease-out ${
        showTabs
          ? 'border-gray-200 bg-gray-50/40 shadow-[0_0_8px_rgba(0,0,0,0.12)] pb-1.5 pr-1.5'
          : 'border-transparent bg-transparent shadow-none'
      }`}
    >
      <Link
        href={getProjectHref ? getProjectHref(project.id) : '#'}
        onClick={() => onProjectClick(project.id)}
        className={`w-full flex items-center ${showIcons ? 'pl-px' : 'pl-2'} pr-1.5 h-[30px] text-[14px] rounded-[6px] transition-colors font-medium ${
          isActive
            ? showTabs
              ? 'text-gray-900'
              : ACTIVE_NAV_ITEM_CLASS
            : 'text-gray-700 hover:bg-gray-100/50'
        }`}
      >
        <span
          className={`relative shrink-0 h-[22px] flex items-center justify-center ${
            showIcons ? 'w-[22px] mr-1.5' : 'w-0 mr-0'
          }`}
        >
          {showIcons &&
            (isPinned ? (
              <Pin
                className="h-[14px] w-[14px] group-hover/item:opacity-0 transition-opacity"
                strokeWidth={1.5}
                style={{ color: iconColor }}
              />
            ) : (
              projectIconNode
            ))}
          {showIcons && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                togglePin(project.id)
              }}
              title={isPinned ? 'Открепить' : 'Закрепить'}
              className="absolute inset-0 flex items-center justify-center md:opacity-0 md:group-hover/item:opacity-100 transition-opacity"
            >
              {isPinned ? (
                <PinOff className="h-[14px] w-[14px] text-gray-500 hover:text-gray-700" />
              ) : (
                <Pin className="h-[14px] w-[14px] text-gray-400 hover:text-gray-600" />
              )}
            </button>
          )}
        </span>
        <span className="flex-1 text-left truncate mr-1">
          {showPrefixes && project.namePrefix ? (
            <span className="text-muted-foreground/70">{project.namePrefix} </span>
          ) : null}
          {project.name}
        </span>
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
      {/* Иконки скрыты — слева нет колонки под pin, поэтому переключатель
          закрепления показываем справа (поверх шеврона) по наведению. */}
      {!showIcons && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            togglePin(project.id)
          }}
          title={isPinned ? 'Открепить' : 'Закрепить'}
          className="absolute right-1.5 top-[15px] -translate-y-1/2 z-10 flex items-center justify-center h-5 w-5 rounded bg-gray-100 md:opacity-0 md:group-hover/item:opacity-100 transition-opacity"
        >
          {isPinned ? (
            <PinOff className="h-[14px] w-[14px] text-gray-500 hover:text-gray-700" />
          ) : (
            <Pin className="h-[14px] w-[14px] text-gray-400 hover:text-gray-600" />
          )}
        </button>
      )}
      {/* Вкладки проекта для клиента — анимированное раскрытие через Radix Collapsible. */}
      {hasTabsWrapper && visibleTabs && (
        <CollapsiblePrimitive.Root open={showTabs}>
          <CollapsiblePrimitive.Content data-slot="sidebar-tabs-collapsible">
            <nav className="ml-[16px] mt-0.5" style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {visibleTabs.map((tab) => {
                const Icon = tab.icon
                const isTabActive = showTabs && activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    tabIndex={showTabs ? 0 : -1}
                    onClick={() => onTabClick?.(project.id, tab.id)}
                    className={`w-full flex items-center pl-px pr-1.5 h-[30px] text-[14px] rounded-[6px] transition-colors font-medium ${
                      isTabActive
                        ? 'bg-gray-200 text-gray-900'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-[16px] w-[16px] shrink-0 mr-1.5" />
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
