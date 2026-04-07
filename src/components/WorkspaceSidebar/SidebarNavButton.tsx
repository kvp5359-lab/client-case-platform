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

export interface SidebarNavButtonProps {
  icon: LucideIcon
  label: string
  href: string
  badge?: string
  isActive?: boolean
  onClick?: () => void
  compact?: boolean
  /** Показывать текст даже когда не активна (в compact mode) */
  showLabel?: boolean
}

export const SidebarNavButton = memo(function SidebarNavButton({
  icon: Icon,
  label,
  href,
  badge,
  isActive,
  onClick,
  compact,
  showLabel,
}: SidebarNavButtonProps) {
  if (compact) {
    return (
      <Link
        href={href}
        onClick={onClick}
        title={label}
        className={cn(
          'relative flex items-center gap-2 px-2 h-[30px] text-[14px] rounded-[6px] transition-colors',
          isActive
            ? 'bg-gray-200 text-gray-900 font-medium'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/50',
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {showLabel && <span>{label}</span>}
        {badge && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none flex items-center justify-center">
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
        'w-full flex items-center gap-2 px-2 h-[30px] text-[14px] rounded-[6px] transition-colors font-medium',
        isActive ? 'bg-gray-200 text-gray-900' : 'text-gray-700 hover:bg-gray-100/50',
      )}
    >
      <span className="shrink-0 w-[22px] h-[22px] flex items-center justify-center">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span className="min-w-[16px] h-4 px-[3px] rounded-[4px] bg-red-500 text-white text-[10px] font-semibold leading-none flex items-center justify-center">
          {badge}
        </span>
      )}
    </Link>
  )
})
