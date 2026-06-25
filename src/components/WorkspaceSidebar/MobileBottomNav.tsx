"use client"

/**
 * Нижняя панель навигации — только мобила (md:hidden). Заменяет плавающий
 * бургер: «Меню» открывает выезжающий сайдбар (проекты, настройки, всё), а
 * остальные кнопки — прямые переходы в ключевые разделы + поиск.
 *
 * Прячется родителем (WorkspaceLayout), когда открыт drawer или правая панель.
 */

import { usePathname, useRouter } from 'next/navigation'
import { Menu } from 'lucide-react'
import { SIDEBAR_NAV_ITEMS, type SidebarNavKey } from '@/lib/sidebarSettings'
import { SidebarGlobalSearch } from './SidebarGlobalSearch'
import { useSidebarInboxCounts } from '@/hooks/messenger/useFilteredInbox'
import { cn } from '@/lib/utils'

// Порядок кнопок (выбор пользователя). «Меню» и «Поиск» — отдельно, остальные
// тянут иконку/лейбл/путь из общего реестра навигации.
const NAV_KEYS: SidebarNavKey[] = ['inbox', 'tasks', 'boards', 'settings']

const SHORT_LABEL: Partial<Record<SidebarNavKey, string>> = {
  boards: 'Доски',
}

const CELL =
  'flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] leading-none min-w-0'

export function MobileBottomNav({
  workspaceId,
  onOpenMenu,
}: {
  workspaceId: string
  onOpenMenu: () => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const inboxUnread = useSidebarInboxCounts(workspaceId).unreadThreadsCount ?? 0
  const base = `/workspaces/${workspaceId}`

  const isActive = (path: string) => {
    const full = path ? `${base}/${path}` : base
    return pathname === full || pathname.startsWith(`${full}/`)
  }

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-[55] flex items-stretch border-t bg-background/95 backdrop-blur h-[var(--cc-bottom-nav-h)] pb-[env(safe-area-inset-bottom)]">
      <button onClick={onOpenMenu} className={cn(CELL, 'text-muted-foreground')} aria-label="Меню">
        <Menu className="h-5 w-5" />
        <span>Меню</span>
      </button>

      {NAV_KEYS.map((key) => {
        const meta = SIDEBAR_NAV_ITEMS[key]
        const Icon = meta.icon
        const active = isActive(meta.path)
        return (
          <button
            key={key}
            onClick={() => router.push(meta.path ? `${base}/${meta.path}` : base)}
            className={cn(CELL, active ? 'text-primary' : 'text-muted-foreground')}
            aria-label={meta.label}
          >
            <span className="relative">
              <Icon className="h-5 w-5" />
              {key === 'inbox' && inboxUnread > 0 && (
                <span className="absolute -top-1.5 -right-2.5 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[9px] font-semibold flex items-center justify-center">
                  {inboxUnread > 99 ? '99+' : inboxUnread}
                </span>
              )}
            </span>
            <span className="truncate max-w-full">{SHORT_LABEL[key] ?? meta.label}</span>
          </button>
        )
      })}

      <div className={cn(CELL, 'text-muted-foreground')}>
        {/* Триггер поиска подгоняем под остальные ячейки: иконка 20px без своей
            подложки/высоты, иначе compact-кнопка (h-8) выше и подпись съезжает. */}
        <SidebarGlobalSearch
          workspaceId={workspaceId}
          compact
          iconSize={20}
          triggerClassName="flex items-center justify-center h-5 text-current"
        />
        <span>Поиск</span>
      </div>
    </nav>
  )
}
