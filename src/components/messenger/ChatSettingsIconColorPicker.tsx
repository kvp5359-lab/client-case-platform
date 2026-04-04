/**
 * Icon & Color picker popover for ChatSettingsDialog.
 */

import { Hash } from 'lucide-react'
import { ACCENT_COLORS, THREAD_ICONS } from './threadConstants'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'

interface ChatSettingsIconColorPickerProps {
  accentColor: ThreadAccentColor
  icon: string
  onAccentColorChange: (color: ThreadAccentColor) => void
  onIconChange: (icon: string) => void
}

export function ChatSettingsIconColorPicker({
  accentColor,
  icon,
  onAccentColorChange,
  onIconChange,
}: ChatSettingsIconColorPickerProps) {
  const IconComp = THREAD_ICONS.find((i) => i.value === icon)?.icon ?? Hash

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Иконка и цвет"
          className={cn(
            'w-9 h-9 rounded-r-md flex items-center justify-center shrink-0 transition-colors hover:bg-muted/50',
            {
              'text-blue-500': accentColor === 'blue',
              'text-stone-600': accentColor === 'slate',
              'text-emerald-600': accentColor === 'emerald',
              'text-amber-500': accentColor === 'amber',
              'text-rose-500': accentColor === 'rose',
              'text-violet-600': accentColor === 'violet',
              'text-orange-500': accentColor === 'orange',
              'text-cyan-600': accentColor === 'cyan',
              'text-pink-500': accentColor === 'pink',
              'text-indigo-600': accentColor === 'indigo',
            },
          )}
        >
          <IconComp className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[240px] p-3" sideOffset={4}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Цвет</span>
            <div className="flex flex-wrap gap-1.5">
              {ACCENT_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => onAccentColorChange(color.value)}
                  title={color.label}
                  className={cn(
                    'w-6 h-6 rounded-full transition-all',
                    color.bg,
                    accentColor === color.value
                      ? `ring-2 ring-offset-1 ${color.ring}`
                      : 'hover:scale-110',
                  )}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Иконка</span>
            <div className="flex flex-wrap gap-1">
              {THREAD_ICONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onIconChange(opt.value)}
                  title={opt.label}
                  className={cn(
                    'w-7 h-7 rounded-md flex items-center justify-center transition-colors',
                    icon === opt.value
                      ? 'bg-brand-100 border border-brand-200 text-brand-600'
                      : 'hover:bg-muted text-muted-foreground',
                  )}
                >
                  <opt.icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
