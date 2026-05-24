"use client"

/**
 * Маленький круглый swatch-селектор цвета бейджа.
 */

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  BADGE_COLORS,
  getBadgeColorMeta,
  type SidebarBadgeColor,
} from '@/lib/sidebarSettings'

export function BadgeColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: SidebarBadgeColor | undefined
  onChange: (color: SidebarBadgeColor) => void
  disabled?: boolean
}) {
  const current = getBadgeColorMeta(value)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={disabled ? 'Сначала выбери тип бейджа' : `Цвет: ${current.label}`}
          className="h-6 w-6 shrink-0 rounded-full border border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-shadow hover:shadow"
          style={{ backgroundColor: current.swatch }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="end">
        <div className="grid grid-cols-4 gap-1.5">
          {BADGE_COLORS.map((c) => {
            const isSelected = (value ?? 'default') === c.value
            return (
              <button
                key={c.value}
                type="button"
                title={c.label}
                onClick={() => onChange(c.value)}
                className={`h-7 w-7 rounded-full border-2 transition-all ${
                  isSelected ? 'border-gray-900 scale-110' : 'border-gray-200 hover:border-gray-400'
                }`}
                style={{ backgroundColor: c.swatch }}
              />
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
