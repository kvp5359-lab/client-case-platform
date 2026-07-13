"use client"

/**
 * Ряд вкладок модулей проекта.
 *
 * Логика (по просьбе владельца): все вкладки равноправны, у каждой иконка +
 * подпись целиком. Ряд листается горизонтально (свайп/скролл, БЕЗ видимого
 * ползунка). Справа — всегда видимая кнопка-«бутерброд» (вне скролла): в её
 * меню ВСЕ вкладки (клик = переход, активная подсвечена). Активная вкладка
 * при переключении подскролливается в зону видимости.
 */

import { type ReactNode, useRef } from 'react'
import { Menu, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useScrollActiveTabIntoView } from '@/hooks/useScrollActiveTabIntoView'

export type TabModule = {
  id: string
  label: string
  icon: LucideIcon
  /** Только иконка в ряду (напр. Настройки). В меню-бутерброде подпись остаётся. */
  iconOnly?: boolean
}

export function ProjectModuleTabBar({
  modules,
  activeTab,
  onSelect,
  renderTabExtra,
}: {
  modules: TabModule[]
  activeTab: string
  onSelect: (id: string) => void
  /** Инлайн-элемент у активной вкладки (напр. «⋮»-меню Задач/Анкет). */
  renderTabExtra?: (id: string) => ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useScrollActiveTabIntoView(scrollRef, activeTab)

  return (
    <div className="pb-3 flex items-center gap-1.5 project-tabs-cq">
      <TabsList className="min-w-0 max-w-full justify-start">
        {/* Скроллящийся ряд вкладок (ползунок скрыт). py/-my — припуск, чтобы
            overflow не подрезал тень активной вкладки; высота ряда не меняется. */}
        <div
          ref={scrollRef}
          className="flex items-center min-w-0 overflow-x-auto scrollbar-hide py-0.5 -my-0.5"
        >
          {modules.map((m) => {
            const Icon = m.icon
            return (
              <TabsTrigger
                key={m.id}
                value={m.id}
                data-tab-id={m.id}
                className="flex items-center gap-1 md:gap-2 shrink-0"
                title={m.label}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!m.iconOnly && <span className="whitespace-nowrap">{m.label}</span>}
                {renderTabExtra?.(m.id)}
              </TabsTrigger>
            )
          })}
        </div>

        {/* Кнопка-«бутерброд» — всегда справа, вне скролла. В меню — ВСЕ вкладки. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Все вкладки"
              aria-label="Все вкладки"
              className="ml-0.5 shrink-0 h-7 w-8 flex items-center justify-center rounded-md bg-background shadow text-muted-foreground hover:text-foreground transition-colors"
            >
              <Menu className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-[70vh] overflow-y-auto">
            {modules.map((m) => {
              const Icon = m.icon
              return (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() => onSelect(m.id)}
                  className={cn(activeTab === m.id && 'bg-accent text-accent-foreground')}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {m.label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </TabsList>
    </div>
  )
}
