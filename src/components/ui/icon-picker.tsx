/**
 * IconPicker — компактный пикер иконки статуса с поповером
 */

import type { ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { safeCssColor } from '@/utils/isValidCssColor'
import { Circle } from 'lucide-react'
import { STATUS_ICONS, type StatusIconDef } from '@/components/ui/status-icons'

interface IconPickerProps {
  value: string | null | undefined
  onChange: (iconId: string) => void
  color?: string
  disabled?: boolean
  /** Если строка непустая — рендерим Label сверху. Пустая строка/undefined — без лейбла. */
  label?: string
  /** Скрыть текст с названием иконки внутри триггера (только сама иконка). */
  hideTriggerText?: boolean
  /**
   * Набор иконок для выбора. По умолчанию — STATUS_ICONS (для статусов).
   * Передай PROJECT_ICONS для иконок шаблонов проектов и т.п.
   */
  icons?: StatusIconDef[]
  /** Ширина поповера в пикселях. По умолчанию 280 (6 колонок). */
  popoverWidth?: number
  /** Высота поповера для скролла, в пикселях. Если не задана — без скролла. */
  popoverMaxHeight?: number
  /**
   * Слот, который рендерится в поповере НАД сеткой иконок (заголовок секции,
   * настройки цвета и т.п.). Опционально.
   */
  popoverHeaderSlot?: ReactNode
  /** Слот, который рендерится в поповере ПОД сеткой иконок. */
  popoverFooterSlot?: ReactNode
  /** Кастомный триггер. Если не передан — рендерится дефолтная кнопка. */
  triggerClassName?: string
}

export function IconPicker({
  value,
  onChange,
  color,
  disabled = false,
  label = 'Иконка',
  hideTriggerText = false,
  icons = STATUS_ICONS,
  popoverWidth = 280,
  popoverMaxHeight,
  popoverHeaderSlot,
  popoverFooterSlot,
  triggerClassName,
}: IconPickerProps) {
  const currentDef = icons.find((i) => i.id === value)
  const CurrentIcon = currentDef?.icon ?? Circle

  return (
    <div className={label ? 'space-y-2' : undefined}>
      {label ? <Label>{label}</Label> : null}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors',
              disabled && 'opacity-50 cursor-not-allowed',
              triggerClassName,
            )}
          >
            <CurrentIcon
              className="w-5 h-5 flex-shrink-0"
              style={{ color: safeCssColor(color || '#6B7280') }}
            />
            {!hideTriggerText && (
              <span className="text-sm text-muted-foreground">
                {currentDef?.label ?? 'Выбрать'}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="p-3"
          align="start"
          style={{ width: popoverWidth }}
        >
          {popoverHeaderSlot && (
            <div className="mb-3 pb-3 border-b">{popoverHeaderSlot}</div>
          )}
          <div
            className="grid grid-cols-6 gap-1"
            style={
              popoverMaxHeight
                ? { maxHeight: popoverMaxHeight, overflowY: 'auto' }
                : undefined
            }
          >
            {icons.map((si) => {
              const Icon = si.icon
              const isSelected = value === si.id
              return (
                <button
                  key={si.id}
                  type="button"
                  title={si.label}
                  onClick={() => onChange(si.id)}
                  className={cn(
                    'w-10 h-10 rounded-md flex items-center justify-center transition-colors',
                    isSelected ? 'ring-2 ring-primary bg-primary/10' : 'hover:bg-muted/50',
                  )}
                  aria-pressed={isSelected}
                  aria-label={si.label}
                >
                  <Icon
                    className="w-5 h-5"
                    style={{ color: safeCssColor(color || '#6B7280') }}
                  />
                </button>
              )
            })}
          </div>
          {popoverFooterSlot && (
            <div className="mt-3 pt-3 border-t">{popoverFooterSlot}</div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
