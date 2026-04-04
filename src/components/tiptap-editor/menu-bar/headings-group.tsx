"use client"

import type { Editor } from '@tiptap/react'
import { Heading1, Heading2, Heading3, ChevronDown, Type } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'

interface HeadingsGroupProps {
  editor: Editor
}

const HEADINGS: { level: 1 | 2 | 3; icon: LucideIcon; label: string }[] = [
  { level: 1, icon: Heading1, label: 'Заголовок 1' },
  { level: 2, icon: Heading2, label: 'Заголовок 2' },
  { level: 3, icon: Heading3, label: 'Заголовок 3' },
]

export function HeadingsGroup({ editor }: HeadingsGroupProps) {
  const [open, setOpen] = useState(false)

  const active = HEADINGS.find((h) => editor.isActive('heading', { level: h.level }))
  const CurrentIcon = active?.icon || Type

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={active?.label || 'Заголовки'}
          className={cn(
            'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-1.5 min-w-9 transition-colors hover:bg-muted hover:text-muted-foreground',
            active && 'bg-accent text-accent-foreground',
          )}
          onMouseDown={(e) => e.preventDefault()}
        >
          <CurrentIcon className="h-4 w-4" />
          <ChevronDown className="h-3 w-3 ml-0.5 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-1 flex gap-0.5">
        <button
          type="button"
          title="Обычный текст"
          className={cn(
            'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-2.5 min-w-9 transition-colors hover:bg-muted hover:text-muted-foreground',
            !active && 'bg-accent text-accent-foreground',
          )}
          onMouseDown={(e) => {
            e.preventDefault()
            editor.chain().focus().setParagraph().run()
            setOpen(false)
          }}
        >
          <Type className="h-4 w-4" />
        </button>
        {HEADINGS.map((h) => {
          const Icon = h.icon
          const isActive = editor.isActive('heading', { level: h.level })
          return (
            <button
              key={h.level}
              type="button"
              title={h.label}
              className={cn(
                'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-2.5 min-w-9 transition-colors hover:bg-muted hover:text-muted-foreground',
                isActive && 'bg-accent text-accent-foreground',
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                editor.chain().focus().toggleHeading({ level: h.level }).run()
                setOpen(false)
              }}
            >
              <Icon className="h-4 w-4" />
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
