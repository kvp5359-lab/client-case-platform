"use client"

/**
 * TaskActionsMenu — ЕДИНЫЙ источник правды для «трёхточечного» меню задачи.
 *
 * Используется везде, где у задачи нужно меню действий:
 *   • TaskRow (страница «Задачи», TaskPanel)
 *   • Поле `menu` в карточке списка/доски (см. listSettingsConfigs.ts)
 *   • Любые будущие точки — просто импортируй компонент.
 *
 * Принцип: компонент сам рендерит кнопку-триггер + dropdown. Снаружи —
 * только props задачи и handlers. Любые новые пункты добавляются здесь
 * один раз и появляются во всех местах автоматически.
 */

import { MoreVertical, ExternalLink, Trash2, CheckCircle2, Calendar as CalendarIcon, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { safeCssColor } from '@/utils/isValidCssColor'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { Calendar as CalendarUI } from '@/components/ui/calendar'
import { ru } from 'date-fns/locale'
import type { StatusOption } from '@/components/common/status-dropdown'

export type TaskActionsMenuProps = {
  /** Открыть карточку задачи в правой панели. */
  onOpen?: () => void

  /** Список доступных статусов (если пуст — пункт «Сменить статус» скрыт). */
  statuses?: StatusOption[]
  /** Текущий статус для подсветки выбранного. */
  currentStatusId?: string | null
  /** Сменить статус. */
  onStatusChange?: (statusId: string | null) => void

  /** Текущий дедлайн (ISO-строка) для подсветки в календаре. */
  deadline?: string | null
  /** Установить дедлайн. */
  onDeadlineSet?: (date: Date) => void
  /** Очистить дедлайн. */
  onDeadlineClear?: () => void
  /** Идёт ли запрос на смену дедлайна (для индикации). */
  deadlinePending?: boolean

  /** Удалить задачу (мягко, в корзину). Если не передан — пункт скрыт. */
  onRequestDelete?: () => void

  /** Дополнительный класс для кнопки-триггера (например opacity-0 hover-патерн). */
  triggerClassName?: string
  /** Align dropdown content. */
  align?: 'start' | 'end' | 'center'
}

export function TaskActionsMenu({
  onOpen,
  statuses,
  currentStatusId,
  onStatusChange,
  deadline,
  onDeadlineSet,
  onDeadlineClear,
  deadlinePending,
  onRequestDelete,
  triggerClassName,
  align = 'start',
}: TaskActionsMenuProps) {
  const hasStatuses = !!(statuses && statuses.length > 0 && onStatusChange)
  const hasDeadline = !!onDeadlineSet
  const hasDelete = !!onRequestDelete
  const hasOpen = !!onOpen

  // Если вообще нечего показывать — не рендерим триггер.
  if (!hasOpen && !hasStatuses && !hasDeadline && !hasDelete) return null

  const deadlineDate = deadline ? new Date(deadline) : undefined

  return (
    <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-6 w-6 p-0 transition-opacity data-[state=open]:opacity-100',
              triggerClassName,
            )}
            aria-label="Меню задачи"
            disabled={deadlinePending}
          >
            <MoreVertical className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="min-w-[180px]">
          {hasOpen && (
            <DropdownMenuItem onClick={onOpen} className="text-xs cursor-pointer">
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              Открыть
            </DropdownMenuItem>
          )}

          {hasStatuses && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-xs cursor-pointer">
                <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                Сменить статус
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-[180px]">
                {statuses!.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    onClick={() => onStatusChange!(s.id)}
                    className={cn(
                      'text-xs cursor-pointer flex items-center gap-2',
                      s.id === currentStatusId && 'font-medium',
                    )}
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: safeCssColor(s.color) ?? '#d1d5db' }}
                    />
                    <span className="truncate">{s.name}</span>
                  </DropdownMenuItem>
                ))}
                {currentStatusId && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onStatusChange!(null)}
                      className="text-xs cursor-pointer text-muted-foreground"
                    >
                      <X className="mr-2 h-3.5 w-3.5" />
                      Сбросить статус
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {hasDeadline && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-xs cursor-pointer">
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                Изменить дедлайн
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="p-0">
                <CalendarUI
                  mode="single"
                  selected={deadlineDate}
                  onSelect={(date) => {
                    if (date) onDeadlineSet!(date)
                  }}
                  locale={ru}
                />
                {deadlineDate && onDeadlineClear && (
                  <div className="border-t px-3 pb-2 pt-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeadlineClear()
                      }}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3 h-3" />
                      Очистить срок
                    </button>
                  </div>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {hasDelete && (
            <>
              {(hasOpen || hasStatuses || hasDeadline) && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={onRequestDelete}
                className="text-xs cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Удалить
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}
