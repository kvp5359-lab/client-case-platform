"use client"

import { memo, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Code } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'
import { CODE_BG_COLORS, CODE_TEXT_COLORS } from './constants'

interface CodeColorPickerProps {
  editor: Editor
}

export const CodeColorPicker = memo(function CodeColorPicker({ editor }: CodeColorPickerProps) {
  const [open, setOpen] = useState(false)

  const isActive = editor.isActive('code')

  // Get current code mark attributes
  const codeAttrs = editor.getAttributes('code')
  const currentBg = codeAttrs?.backgroundColor || null
  const currentText = codeAttrs?.color || null

  const applyCode = (bg: string | null, text: string | null) => {
    if (!isActive) {
      // Set code mark with colors
      editor
        .chain()
        .focus()
        .setMark('code', {
          backgroundColor: bg,
          color: text,
        })
        .run()
    } else {
      // Update existing code mark colors
      editor
        .chain()
        .focus()
        .updateAttributes('code', {
          backgroundColor: bg,
          color: text,
        })
        .run()
    }
  }

  const handleToggleCode = (e: React.MouseEvent) => {
    e.preventDefault()
    if (isActive) {
      editor.chain().focus().unsetMark('code').run()
      setOpen(false)
    } else {
      // Apply code with default styling (no custom colors)
      editor.chain().focus().toggleCode().run()
    }
  }

  const handleBgSelect = (color: string | null) => {
    applyCode(color, currentText)
  }

  const handleTextSelect = (color: string | null) => {
    applyCode(currentBg, color)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Toggle
          size="sm"
          pressed={isActive}
          title="Код"
          onMouseDown={(e) => {
            // Right area — open popover (default behavior)
            e.preventDefault()
          }}
        >
          <Code className="h-4 w-4" />
        </Toggle>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="space-y-3">
          {/* Toggle code on/off */}
          <button
            type="button"
            className={cn(
              'w-full text-left text-sm px-2 py-1.5 rounded-md transition-colors',
              isActive ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-muted hover:bg-accent',
            )}
            onMouseDown={(e) => {
              e.preventDefault()
              handleToggleCode(e)
            }}
          >
            {isActive ? 'Убрать код' : 'Применить код'}
          </button>

          {/* Background colors */}
          <div>
            <div className="text-xs text-muted-foreground mb-1.5">Фон</div>
            <div className="grid grid-cols-9 gap-1">
              {CODE_BG_COLORS.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className={cn(
                    'w-6 h-6 rounded border transition-all hover:scale-110',
                    currentBg === item.color && item.color && 'ring-2 ring-primary ring-offset-1',
                    !item.color &&
                      currentBg === null &&
                      isActive &&
                      'ring-2 ring-primary ring-offset-1',
                    !item.color && 'bg-white border-dashed',
                  )}
                  style={item.color ? { backgroundColor: item.color } : undefined}
                  title={item.name}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleBgSelect(item.color)
                  }}
                />
              ))}
            </div>
          </div>

          {/* Text colors */}
          <div>
            <div className="text-xs text-muted-foreground mb-1.5">Текст</div>
            <div className="grid grid-cols-9 gap-1">
              {CODE_TEXT_COLORS.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className={cn(
                    'w-6 h-6 rounded border transition-all hover:scale-110 font-bold text-xs flex items-center justify-center',
                    currentText === item.color && item.color && 'ring-2 ring-primary ring-offset-1',
                    !item.color &&
                      currentText === null &&
                      isActive &&
                      'ring-2 ring-primary ring-offset-1',
                    !item.color && 'border-dashed',
                  )}
                  style={item.color ? { color: item.color } : undefined}
                  title={item.name}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleTextSelect(item.color)
                  }}
                >
                  A
                </button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
})
