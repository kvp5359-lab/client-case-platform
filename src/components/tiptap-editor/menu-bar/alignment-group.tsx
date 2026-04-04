"use client"

import type { Editor } from '@tiptap/react'
import { AlignLeft, AlignCenter, AlignRight, AlignJustify, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'

interface AlignmentGroupProps {
  editor: Editor
}

const ALIGNMENTS: { value: string; icon: LucideIcon; label: string }[] = [
  { value: 'left', icon: AlignLeft, label: 'По левому краю' },
  { value: 'center', icon: AlignCenter, label: 'По центру' },
  { value: 'right', icon: AlignRight, label: 'По правому краю' },
  { value: 'justify', icon: AlignJustify, label: 'По ширине' },
]

export function AlignmentGroup({ editor }: AlignmentGroupProps) {
  const [open, setOpen] = useState(false)

  const current = ALIGNMENTS.find((a) => editor.isActive({ textAlign: a.value })) || ALIGNMENTS[0]
  const CurrentIcon = current.icon

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={current.label}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-1.5 min-w-9 transition-colors hover:bg-muted hover:text-muted-foreground"
          onMouseDown={(e) => e.preventDefault()}
        >
          <CurrentIcon className="h-4 w-4" />
          <ChevronDown className="h-3 w-3 ml-0.5 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-1 flex gap-0.5">
        {ALIGNMENTS.map((a) => {
          const Icon = a.icon
          const isActive = editor.isActive({ textAlign: a.value })
          return (
            <Toggle
              key={a.value}
              size="sm"
              pressed={isActive}
              title={a.label}
              onMouseDown={(e) => {
                e.preventDefault()
                editor.chain().focus().setTextAlign(a.value).run()
                setOpen(false)
              }}
              className={cn(isActive && 'bg-accent text-accent-foreground')}
            >
              <Icon className="h-4 w-4" />
            </Toggle>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
