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
          'relative flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md transition-colors',
          isActive
            ? 'bg-gray-200 text-gray-900 font-semibold'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/50',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {(isActive || showLabel) && <span className="text-sm">{label}</span>}
        {badge && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none flex items-center justify-center">
            {badge}
          </span>
        )}
      </Link>
    )
  }

  const className = `w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md transition-colors ${
    isActive ? 'bg-gray-200 text-gray-900 font-semibold' : 'text-gray-700 hover:bg-gray-100/50'
  }`
  const content = (
    <>
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      {badge && <span className="ml-auto text-xs font-bold text-red-600">{badge}</span>}
    </>
  )
  return (
    <Link href={href} onClick={onClick} className={className}>
      {content}
    </Link>
  )
})
