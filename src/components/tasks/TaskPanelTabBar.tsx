"use client"

/**
 * TaskPanelTabBar — горизонтальный ряд вкладок сверху TaskPanel.
 *
 * Слева направо:
 *  - Открытые вкладки. Thread-вкладки компактнее: иконка + короткий заголовок,
 *    меньше padding. Системные вкладки — стандартного размера с иконкой.
 *  - Кнопка [+] с меню системных разделов.
 *  - В правом углу — кнопка скрытия панели (✕). Скрывает UI, не трогая список
 *    вкладок (он сохраняется в БД и появится при следующем открытии).
 */

import { useMemo } from 'react'
import {
  Plus,
  X,
  Check,
  Bot,
  Settings2,
  History,
  FileText,
  ListChecks,
  FormInput,
  BookOpen,
  Mail,
  MessageSquare,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getChatIconComponent, getChatTabAccent } from '@/components/messenger/EditChatDialog'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import type { TaskPanelTab, TaskPanelTabType } from './taskPanelTabs.types'
import { makeTabId } from './taskPanelTabs.types'

interface SystemTabDef {
  type: Exclude<TaskPanelTabType, 'thread'>
  title: string
  icon: React.ComponentType<{ className?: string }>
}

const SYSTEM_TABS: SystemTabDef[] = [
  { type: 'tasks',      title: 'Задачи',             icon: ListChecks },
  { type: 'history',    title: 'История',            icon: History },
  { type: 'documents',  title: 'Документы',          icon: FileText },
  { type: 'forms',      title: 'Анкеты',             icon: FormInput },
  { type: 'materials',  title: 'Полезные материалы', icon: BookOpen },
  { type: 'assistant',  title: 'Ассистент',          icon: Bot },
  { type: 'extra',      title: 'Дополнительно',      icon: Settings2 },
]

const SYSTEM_TAB_BY_TYPE = new Map<string, SystemTabDef>(SYSTEM_TABS.map((d) => [d.type, d]))

interface TaskPanelTabBarProps {
  tabs: TaskPanelTab[]
  activeTabId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onOpenSystem: (def: SystemTabDef) => void
  /** Карта непрочитанных сообщений per-thread. Используется для бейджей. */
  unreadByThreadId?: Record<string, number>
  /** Какие системные типы доступны пользователю по правам (для фильтра [+] меню). */
  visibleSystemTypes?: Set<TaskPanelTabType>
}

/** Подобрать иконку для вкладки. */
function getTabIcon(tab: TaskPanelTab): React.ComponentType<{ className?: string }> {
  if (tab.type === 'thread') {
    // Кастомная иконка треда — приоритет.
    if (tab.meta?.icon) {
      return getChatIconComponent(tab.meta.icon) as React.ComponentType<{ className?: string }>
    }
    // По типу треда — task | chat | email.
    const tt = tab.meta?.threadType
    if (tt === 'task') return CheckCircle2
    if (tt === 'email') return Mail
    return MessageSquare
  }
  return SYSTEM_TAB_BY_TYPE.get(tab.type)?.icon ?? MessageSquare
}

export function TaskPanelTabBar({
  tabs,
  activeTabId,
  onActivate,
  onClose,
  onOpenSystem,
  unreadByThreadId = {},
  visibleSystemTypes,
}: TaskPanelTabBarProps) {
  // Если visibleSystemTypes не передан — показываем все (обратная совместимость).
  const visibleSystemDefs = useMemo(
    () =>
      visibleSystemTypes
        ? SYSTEM_TABS.filter((d) => visibleSystemTypes.has(d.type))
        : SYSTEM_TABS,
    [visibleSystemTypes],
  )
  const openedSystemTypes = useMemo(() => {
    const set = new Set<string>()
    for (const t of tabs) if (t.type !== 'thread') set.add(t.type)
    return set
  }, [tabs])

  return (
    <div className="flex items-center gap-1 px-2 h-9 border-b bg-gray-50/80 shrink-0 min-w-0">
      <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const isThread = tab.type === 'thread'
          const Icon = getTabIcon(tab)
          const accent = isThread && tab.meta?.accentColor
            ? getChatTabAccent(tab.meta.accentColor as ThreadAccentColor)
            : null
          const unread = isThread && tab.refId ? unreadByThreadId[tab.refId] ?? 0 : 0
          return (
            <div
              key={tab.id}
              className={cn(
                'group flex items-center gap-1 rounded-full text-xs cursor-pointer transition-all min-w-0',
                'pl-2 pr-1 h-6 min-w-[56px]',
                // Активная вкладка не сжимается — всегда видна целиком до своего max.
                isActive ? 'shrink-0' : 'shrink',
                isActive
                  ? cn(
                      'border border-gray-300 shadow-md ring-1 ring-black/5',
                      accent ? accent.active : 'bg-white text-foreground',
                    )
                  : 'text-muted-foreground hover:bg-white/70 hover:text-foreground',
              )}
              onClick={() => onActivate(tab.id)}
              title={tab.title}
            >
              <Icon className="shrink-0 w-3.5 h-3.5" />
              <span className="truncate min-w-0 flex-1 max-w-[110px]">{tab.title}</span>

              {/* Бейдж непрочитанности (виден по умолчанию) и крестик закрытия
                  (виден только при hover на вкладке) — занимают одно и то же место. */}
              <div className="relative w-4 h-4 shrink-0">
                {unread > 0 && (
                  <span
                    className={cn(
                      'absolute inset-0 flex items-center justify-center rounded-full text-[10px] leading-none font-semibold text-white px-1',
                      'group-hover:opacity-0 transition-opacity',
                      accent ? accent.badge : 'bg-blue-600',
                    )}
                  >
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
                <button
                  type="button"
                  className={cn(
                    'absolute inset-0 flex items-center justify-center rounded-full hover:bg-gray-200 text-muted-foreground/70 hover:text-foreground',
                    // Если есть бейдж — крестик скрыт, появляется по hover.
                    unread > 0 ? 'opacity-0 group-hover:opacity-100 transition-opacity' : '',
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    onClose(tab.id)
                  }}
                  aria-label="Закрыть вкладку"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
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
            {visibleSystemDefs.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                Нет доступных разделов
              </div>
            )}
            {visibleSystemDefs.map((def) => {
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
    </div>
  )
}

export type { SystemTabDef }
