"use client"

/**
 * FloatingPanelButtons — единственная плавающая кнопка справа: переключает
 * показ/скрытие новой системы вкладок (TaskPanelTabbedShell).
 *
 * Старые кнопки (Чаты/Ассистент/Дополнительно), которые открывали legacy
 * «основную» правую панель проекта, удалены — основная панель архивирована.
 *
 * Кнопка показывается только если у пользователя есть хотя бы одна вкладка
 * в текущем scope (иначе показывать нечего).
 */

import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useLayoutTaskPanel } from '@/components/tasks/TaskPanelContext'

export function FloatingPanelButtons() {
  const ctx = useLayoutTaskPanel()
  const isHidden = ctx?.isHidden ?? false
  const hasTabs = ctx?.hasTabs ?? false
  const togglePanel = ctx?.togglePanel

  // Кнопка не нужна если: нет вкладок (нечего показывать) ИЛИ панель уже видна
  // (внутри неё свой ✕ для скрытия). Показываем только когда панель скрыта,
  // но вкладки есть — чтобы можно было её вернуть.
  if (!hasTabs || !isHidden || !togglePanel) return null

  return (
    <TooltipProvider>
      <div
        style={{
          animation: 'panel-tab-slide-in 300ms ease-out forwards',
          transform: 'translateX(100%)',
        }}
        className="absolute right-0 top-[6px] z-40 flex flex-col gap-px"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={togglePanel}
              aria-label="Открыть панель"
              className={cn(
                'relative w-7 h-10 rounded-l-md border-2 border-r-0 flex items-center justify-center',
                'transition-[background-color,color,border-color] duration-150 shadow-sm',
                'bg-white border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600',
              )}
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">Открыть панель</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
