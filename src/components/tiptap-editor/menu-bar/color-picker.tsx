"use client"

import { memo } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { ColorItem } from './constants'

interface ColorPickerProps {
  colors: ColorItem[]
  currentColor: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (color: string | null) => void
  icon: React.ReactNode
  title: string
  isActive?: boolean
}

/**
 * Компонент выбора цвета (для текста и маркера)
 */
export const ColorPicker = memo(function ColorPicker({
  colors,
  currentColor,
  open,
  onOpenChange,
  onSelect,
  icon,
  title,
  isActive = false,
}: ColorPickerProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-2.5 min-w-9 transition-colors hover:bg-muted hover:text-muted-foreground relative',
            isActive && 'bg-accent text-accent-foreground',
          )}
          title={title}
        >
          {icon}
          {currentColor && (
            <span
              className="absolute bottom-1 left-1/2 -translate-x-1/2 w-4 h-1 rounded-full"
              style={{ backgroundColor: currentColor }}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2">
        <div className="grid grid-cols-5 gap-1">
          {colors.map((item) => (
            <button
              key={item.name}
              type="button"
              className={cn(
                'w-7 h-7 rounded-md border transition-all hover:scale-110',
                currentColor === item.color && 'ring-2 ring-primary ring-offset-1',
                !item.color &&
                  'bg-gradient-to-br from-gray-100 to-gray-300 dark:from-gray-700 dark:to-gray-500',
              )}
              style={item.color ? { backgroundColor: item.color } : undefined}
              title={item.name}
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(item.color)
                onOpenChange(false)
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
})
