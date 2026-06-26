/**
 * SettingsSubNav — единая боковая под-навигация для разделов настроек.
 * Один визуальный стиль для всех вкладок с боковой панелью (Участники,
 * Справочники, Шаблоны, Интеграции): активный пункт amber, фон bg-white,
 * группы с заголовками, опциональные иконка и бейдж-счётчик.
 */

import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type SettingsSubNavItem = {
  id: string
  label: string
  icon?: LucideIcon
  /** Счётчик справа (бейдж). undefined → бейдж не рисуется. */
  count?: number
}

export type SettingsSubNavGroup = {
  /** Заголовок группы (UPPERCASE). undefined → без заголовка (первая группа). */
  title?: string
  items: SettingsSubNavItem[]
}

type Props = {
  groups: SettingsSubNavGroup[]
  activeId: string
  onSelect: (id: string) => void
  className?: string
}

export function SettingsSubNav({ groups, activeId, onSelect, className }: Props) {
  return (
    <aside
      className={cn('w-56 border-r bg-white p-3 flex-shrink-0 overflow-y-auto', className)}
    >
      <nav className="space-y-1">
        {groups.map((group, gi) => (
          <div key={group.title ?? `g${gi}`} className={group.title ? 'pt-4 first:pt-0' : ''}>
            {group.title && (
              <p className="px-3 mb-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.id === activeId
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className={cn(
                      'w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between gap-2',
                      active
                        ? 'bg-amber-100 text-amber-900 font-medium'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {Icon && <Icon className="h-4 w-4 shrink-0" />}
                      <span className="truncate">{item.label}</span>
                    </span>
                    {typeof item.count === 'number' && (
                      <Badge variant="secondary" className="ml-2 text-xs shrink-0">
                        {item.count}
                      </Badge>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}
