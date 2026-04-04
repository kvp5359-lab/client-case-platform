/**
 * Popover для выбора иконки и цвета треда.
 * Используется в ThreadTemplateDialog.
 */

import { createElement } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ACCENT_COLORS, THREAD_ICONS } from '@/components/messenger/threadConstants'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'

interface IconColorPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accentColor: ThreadAccentColor
  icon: string
  onColorChange: (color: ThreadAccentColor) => void
  onIconChange: (icon: string) => void
}

export function IconColorPicker({
  open,
  onOpenChange,
  accentColor,
  icon,
  onColorChange,
  onIconChange,
}: IconColorPickerProps) {
  const selectedColorObj = ACCENT_COLORS.find((c) => c.value === accentColor)
  const selectedIconObj = THREAD_ICONS.find((i) => i.value === icon)

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9 flex-shrink-0">
          <div
            className={cn('w-5 h-5 rounded flex items-center justify-center', selectedColorObj?.bg)}
          >
            {selectedIconObj &&
              createElement(selectedIconObj.icon, { className: 'w-3.5 h-3.5 text-white' })}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-3" align="end">
        <p className="text-xs font-medium text-muted-foreground mb-2">Цвет</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={cn(
                'w-6 h-6 rounded-full ring-offset-2',
                c.bg,
                accentColor === c.value && `ring-2 ${c.ring}`,
              )}
              onClick={() => onColorChange(c.value)}
              title={c.label}
            />
          ))}
        </div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Иконка</p>
        <div className="grid grid-cols-8 gap-1">
          {THREAD_ICONS.map((i) => (
            <button
              key={i.value}
              type="button"
              className={cn(
                'p-1.5 rounded hover:bg-muted',
                icon === i.value && 'bg-muted ring-1 ring-primary',
              )}
              onClick={() => onIconChange(i.value)}
              title={i.label}
            >
              {createElement(i.icon, { className: 'w-4 h-4' })}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
