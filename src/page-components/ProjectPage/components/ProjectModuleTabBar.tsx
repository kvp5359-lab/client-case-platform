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

// Резерв ширины под кнопку-бутерброд (32) + зазоры + небольшой запас на «⋮»-меню
// активной вкладки. Меньше значение — плотнее ряд (пустоту заполняет «частичная»
// вкладка с обрезкой).
const RESERVE_PX = 52

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
  // Ширина (px) для «частичной» последней вкладки, что занимает остаток места
  // с обрезанным названием. null — последняя вкладка целая.
  const [partialWidth, setPartialWidth] = useState<number | null>(null)

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
        if (sum + k.offsetWidth > avail) break
        sum += k.offsetWidth
        fit++
      }
      const remaining = avail - sum
      // Остаток заполняем следующей вкладкой с обрезкой, если он ощутимый
      // (хватает на иконку + пару букв).
      const showPartial = fit < kids.length && remaining >= 56
      setVisibleCount(Math.max(1, fit + (showPartial ? 1 : 0)))
      setPartialWidth(showPartial ? remaining : null)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(row)
    return () => ro.disconnect()
    // modulesKey меняется при смене набора вкладок → перезамер.
  }, [modulesKey])

  // Гарантируем, что активная вкладка видима в ряду: если она за порогом
  // видимости — заменяем ею последний видимый слот (целиком, без обрезки).
  const activeIndex = modules.findIndex((m) => m.id === activeTab)
  let visible = modules.slice(0, visibleCount)
  let truncateLast = partialWidth != null
  if (activeIndex >= 0 && activeIndex >= visibleCount) {
    visible = [...modules.slice(0, Math.max(0, visibleCount - 1)), modules[activeIndex]]
    truncateLast = false
  }
  // Если «частичной» оказалась активная вкладка — показываем её целиком.
  if (truncateLast && visible[visible.length - 1]?.id === activeTab) {
    truncateLast = false
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
              className="inline-flex items-center gap-1 md:gap-2 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium"
            >
              <Icon className="w-4 h-4" />
              {!m.iconOnly && m.label}
            </span>
          )
        })}
      </div>

      <TabsList className="flex-1 min-w-0 justify-start overflow-hidden">
        {visible.map((m, i) => {
          const Icon = m.icon
          const partial = truncateLast && i === visible.length - 1
          return (
            <TabsTrigger
              key={m.id}
              value={m.id}
              className={cn('flex items-center gap-1 md:gap-2', partial ? 'min-w-0' : 'shrink-0')}
              style={partial ? { maxWidth: partialWidth ?? undefined } : undefined}
              title={m.label}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!m.iconOnly && (
                <span className={partial ? 'truncate min-w-0' : 'whitespace-nowrap'}>{m.label}</span>
              )}
              {renderTabExtra?.(m.id)}
            </TabsTrigger>
          )
        })}
      </TabsList>

      {/* Кнопка-«бутерброд» — всегда видна, список ВСЕХ вкладок. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Все вкладки"
            aria-label="Все вкладки"
            className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
    </div>
  )
}
