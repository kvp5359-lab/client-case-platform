"use client"

/**
 * SidebarNavButton — переиспользуемая кнопка навигации для WorkspaceSidebar
 * Используется в основном меню и нижнем меню
 *
 * compact mode: неактивные — только иконка, активная — иконка + текст (стиль Notion)
 */

import { memo } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'
import { getBadgeColorMeta, type SidebarBadgeColor } from '@/lib/sidebarSettings'

export type SidebarNavButtonProps = {
  icon: LucideIcon
  label: string
  href: string
  badge?: string
  badgeColor?: SidebarBadgeColor
  isActive?: boolean
  onClick?: () => void
  compact?: boolean
  /** Показывать текст даже когда не активна (в compact mode) */
  showLabel?: boolean
  /**
   * Узел, который подменяет иконку при ховере родительского `.group/pin`.
   * Используется для кнопок-действий вроде «Открепить» — оверлей слева,
   * а не справа, чтобы не наезжать на бейдж.
   */
  hoverIconSlot?: React.ReactNode
}

export const SidebarNavButton = memo(function SidebarNavButton({
  icon: Icon,
  label,
  href,
  badge,
  badgeColor,
  isActive,
  onClick,
  compact,
  showLabel,
  hoverIconSlot,
}: SidebarNavButtonProps) {
  const badgeMeta = getBadgeColorMeta(badgeColor)
  if (compact) {
    return (
      <Link
        href={href}
        onClick={onClick}
        title={label}
        className={cn(
          'relative flex items-center justify-center gap-2 px-3 h-10 md:px-2 md:h-[30px] text-[14px] rounded-[6px] transition-colors',
          isActive
            ? 'bg-gray-200 text-gray-900 font-medium'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/50',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {showLabel && <span>{label}</span>}
        {badge && (
          <span className={cn(
            'absolute -top-0.5 -right-0.5 min-w-[16px] h-[14px] px-[3px] rounded-[4px] text-[10px] font-semibold leading-none flex items-center justify-center',
            badgeMeta.pillClasses,
          )}>
            {badge}
          </span>
        )}
      </Link>
    )
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'w-full flex items-center pl-0.5 pr-1.5 h-[30px] text-[14px] rounded-[6px] transition-colors font-medium',
        isActive ? 'bg-gray-200 text-gray-900' : 'text-gray-700 hover:bg-gray-100/50',
      )}
    >
      <span className="relative shrink-0 w-[22px] h-[22px] mr-1.5 flex items-center justify-center">
        <Icon
          className={cn(
            'h-[14px] w-[14px]',
            hoverIconSlot && 'group-hover/pin:hidden',
          )}
        />
        {hoverIconSlot && (
          <span className="md:hidden md:group-hover/pin:flex absolute inset-0 items-center justify-center">
            {hoverIconSlot}
          </span>
        )}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span className={cn(
          'min-w-[18px] h-[18px] px-[3px] rounded-[4px] text-[11px] font-semibold leading-none flex items-center justify-center',
          badgeMeta.pillClasses,
        )}>
          {badge}
        </span>
      )}
    </Link>
  )
})
