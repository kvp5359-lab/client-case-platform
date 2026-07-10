"use client"

/**
 * Ряд вкладок модулей проекта с измеряемым overflow.
 *
 * Логика (по просьбе владельца): все вкладки равноправны, у каждой иконка +
 * подпись целиком. Что НЕ помещается в ширину ряда — уходит в кнопку-«бутерброд»
 * справа (без горизонтального скролла). В меню бутерброда — ВСЕ вкладки (клик =
 * переход, активная подсвечена). Активная вкладка всегда остаётся видимой в ряду.
 *
 * Ширины меряем в скрытом ряду-клоне (стабильный источник — там всегда все
 * вкладки), затем считаем сколько влезает; ResizeObserver пересчитывает при
 * изменении ширины (в т.ч. при открытии боковой панели).
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Menu, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type TabModule = {
  id: string
  label: string
  icon: LucideIcon
  /** Только иконка в ряду (напр. Настройки). В меню-бутерброде подпись остаётся. */
  iconOnly?: boolean
}

// Резерв ширины под кнопку-бутерброд (32) + зазоры.
const RESERVE_PX = 44
// Ширина «⋮»-меню активной вкладки (renderTabExtra). Клон-замер его НЕ включает,
// поэтому у активной вкладки реальная ширина больше — учитываем это в подсчёте,
// иначе число видимых вкладок скачет при переключении на вкладку с «⋮».
const ACTIVE_EXTRA_PX = 34

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
  const rowRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(modules.length)

  const modulesKey = modules.map((m) => m.id).join(',')

  useLayoutEffect(() => {
    const row = rowRef.current
    const measure = measureRef.current
    if (!row || !measure) return
    const compute = () => {
      const avail = row.clientWidth - RESERVE_PX
      const kids = Array.from(measure.children) as HTMLElement[]
      let sum = 0
      let fit = 0
      for (const k of kids) {
        // У активной вкладки в реальном ряду есть «⋮»-меню (renderTabExtra),
        // которого нет в клоне — прибавляем его ширину, чтобы подсчёт совпал.
        const w = k.offsetWidth + (k.dataset.tabId === activeTab ? ACTIVE_EXTRA_PX : 0)
        if (sum + w > avail) break
        sum += w
        fit++
      }
      setVisibleCount(Math.max(1, fit))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(row)
    return () => ro.disconnect()
    // Перезамер при смене набора вкладок и активной (её ширина с «⋮» иная).
  }, [modulesKey, activeTab])

  // Гарантируем, что активная вкладка видима в ряду: если она за порогом
  // видимости — заменяем ею последний видимый слот.
  const activeIndex = modules.findIndex((m) => m.id === activeTab)
  let visible = modules.slice(0, visibleCount)
  if (activeIndex >= 0 && activeIndex >= visibleCount) {
    visible = [...modules.slice(0, Math.max(0, visibleCount - 1)), modules[activeIndex]]
  }

  return (
    <div ref={rowRef} className="pb-3 flex items-center gap-1.5 project-tabs-cq relative">
      {/* Скрытый ряд-клон для замера ширин (всегда все вкладки). */}
      <div
        ref={measureRef}
        aria-hidden
        className="absolute left-0 top-0 -z-10 flex items-center opacity-0 pointer-events-none"
      >
        {modules.map((m) => {
          const Icon = m.icon
          return (
            <span
              key={m.id}
              data-tab-id={m.id}
              className="inline-flex items-center gap-1 md:gap-2 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium"
            >
              <Icon className="w-4 h-4" />
              {!m.iconOnly && m.label}
            </span>
          )
        })}
      </div>

      <TabsList className="min-w-0 justify-start overflow-hidden">
        {visible.map((m) => {
          const Icon = m.icon
          return (
            <TabsTrigger
              key={m.id}
              value={m.id}
              className="flex items-center gap-1 md:gap-2 shrink-0"
              title={m.label}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!m.iconOnly && <span className="whitespace-nowrap">{m.label}</span>}
              {renderTabExtra?.(m.id)}
            </TabsTrigger>
          )
        })}
        {/* Кнопка-«бутерброд» на той же серой плашке, сразу за последней вкладкой. */}
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
