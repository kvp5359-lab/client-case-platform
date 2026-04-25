"use client"

/**
 * TaskPanelTabBar — горизонтальный ряд вкладок сверху TaskPanel.
 *
 * Слева направо: открытые вкладки (можно закрыть крестиком), затем кнопка [+]
 * с меню системных разделов (Ассистент, Дополнительно, История и т.д.).
 *
 * Системные разделы, уже открытые во вкладках, в меню помечены галочкой
 * и при клике переключают на существующую вкладку (без дубля).
 */

import { useMemo } from 'react'
import { Plus, X, Check, Bot, Settings2, History, FileText, ListChecks, FormInput, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { TaskPanelTab, TaskPanelTabType } from './taskPanelTabs.types'
import { makeTabId } from './taskPanelTabs.types'

interface SystemTabDef {
  type: Exclude<TaskPanelTabType, 'thread'>
  title: string
  icon: React.ComponentType<{ className?: string }>
}

const SYSTEM_TABS: SystemTabDef[] = [
  { type: 'tasks',      title: 'Все задачи',         icon: ListChecks },
  { type: 'history',    title: 'История',            icon: History },
  { type: 'documents',  title: 'Документы',          icon: FileText },
  { type: 'forms',      title: 'Анкеты',             icon: FormInput },
  { type: 'materials',  title: 'Полезные материалы', icon: BookOpen },
  { type: 'assistant',  title: 'Ассистент',          icon: Bot },
  { type: 'extra',      title: 'Дополнительно',      icon: Settings2 },
]

interface TaskPanelTabBarProps {
  tabs: TaskPanelTab[]
  activeTabId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onOpenSystem: (def: SystemTabDef) => void
}

export function TaskPanelTabBar({
  tabs,
  activeTabId,
  onActivate,
  onClose,
  onOpenSystem,
}: TaskPanelTabBarProps) {
  const openedSystemTypes = useMemo(() => {
    const set = new Set<string>()
    for (const t of tabs) if (t.type !== 'thread') set.add(t.type)
    return set
  }, [tabs])

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-gray-50/80 shrink-0 min-w-0 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            className={cn(
              'group flex items-center gap-1 pl-2.5 pr-1 h-7 rounded-md text-sm shrink-0 cursor-pointer transition-colors',
              isActive
                ? 'bg-white border border-gray-200 text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-white/60 hover:text-foreground',
            )}
            onClick={() => onActivate(tab.id)}
          >
            <span className="max-w-[140px] truncate">{tab.title}</span>
            <button
              type="button"
              className="flex items-center justify-center w-5 h-5 rounded hover:bg-gray-200 text-muted-foreground/70 hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                onClose(tab.id)
              }}
              aria-label="Закрыть вкладку"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-white hover:text-foreground transition-colors shrink-0"
            aria-label="Открыть раздел"
            title="Открыть раздел"
          >
            <Plus className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {SYSTEM_TABS.map((def) => {
            const Icon = def.icon
            const isOpen = openedSystemTypes.has(def.type)
            return (
              <DropdownMenuItem
                key={def.type}
                onClick={() => {
                  if (isOpen) {
                    onActivate(makeTabId(def.type))
                  } else {
                    onOpenSystem(def)
                  }
                }}
              >
                <Icon className="w-4 h-4 mr-2" />
                <span className="flex-1">{def.title}</span>
                {isOpen && <Check className="w-4 h-4 text-muted-foreground" />}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export type { SystemTabDef }
