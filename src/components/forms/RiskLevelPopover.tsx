"use client"

/**
 * RiskLevelPopover — маркер риск-оценки поля анкеты + попап выбора (🟢🟡🔴 / снять).
 *
 * Рендерит сам маркер-кружок (триггер) — FloatingField позиционирует его слева у поля
 * через className. Виден на наведении (group-hover) либо когда попап открыт.
 * Показывается только сотруднику (решение принимает вызывающий компонент).
 */

import { useState } from 'react'
import { X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ColorDot } from '@/components/ui/color-dot'
import { cn } from '@/lib/utils'
import { RISK_LEVELS, RISK_COLORS, RISK_LABELS, RISK_UNSET_COLOR, type RiskLevel } from './riskLevels'

type RiskLevelPopoverProps = {
  value: RiskLevel | null
  onChange: (value: RiskLevel | null) => void
  /** Доп. классы для позиционирования маркера-триггера. */
  className?: string
}

export function RiskLevelPopover({ value, onChange, className }: RiskLevelPopoverProps) {
  const [open, setOpen] = useState(false)

  const select = (next: RiskLevel | null) => {
    onChange(next)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Оценка риска"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'flex items-center justify-center rounded-full transition-opacity',
            // виден на ховере поля или при открытом попапе
            'md:opacity-0 md:group-hover:opacity-100 data-[state=open]:opacity-100',
            className,
          )}
        >
          <span
            className="block h-3.5 w-3.5 rounded-full ring-2 ring-background shadow-sm"
            style={{ backgroundColor: value ? RISK_COLORS[value] : RISK_UNSET_COLOR }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start" side="left">
        <div className="flex items-center gap-1.5">
          {RISK_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              title={RISK_LABELS[level]}
              aria-label={RISK_LABELS[level]}
              onClick={() => select(level)}
              className={cn(
                'rounded-full p-0.5 transition-transform hover:scale-110',
                value === level && 'ring-2 ring-foreground ring-offset-1',
              )}
            >
              <ColorDot color={RISK_COLORS[level]} className="h-5 w-5" />
            </button>
          ))}
          <div className="mx-0.5 h-5 w-px bg-border" />
          <button
            type="button"
            title="Снять оценку"
            aria-label="Снять оценку"
            onClick={() => select(null)}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
