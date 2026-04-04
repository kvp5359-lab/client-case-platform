"use client"

import type { Editor } from '@tiptap/react'
import { Quote, Minus, MessageSquareWarning, ChevronDown, Columns2, Columns3 } from 'lucide-react'
import { ToolbarButton, ToolbarPlainButton } from './toolbar-button'
import { CodeColorPicker } from './code-color-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface BlocksGroupProps {
  editor: Editor
}

export function BlocksGroup({ editor }: BlocksGroupProps) {
  const [columnsOpen, setColumnsOpen] = useState(false)

  return (
    <>
      {/* Цитата */}
      <ToolbarPlainButton
        icon={Quote}
        isActive={editor.isActive('blockquote')}
        onAction={() => editor.chain().focus().toggleBlockquote().run()}
        title="Цитата"
      />

      {/* Код с палитрой цветов */}
      <CodeColorPicker editor={editor} />

      {/* Горизонтальная линия */}
      <ToolbarButton
        icon={Minus}
        onAction={() => editor.chain().focus().setHorizontalRule().run()}
        title="Горизонтальная линия"
      />

      {/* Каллаут */}
      <ToolbarButton
        icon={MessageSquareWarning}
        isActive={editor.isActive('callout')}
        onAction={() => editor.chain().focus().setCallout().run()}
        title="Каллаут"
      />

      {/* Аккордеон (спойлер) */}
      <ToolbarButton
        icon={ChevronDown}
        isActive={editor.isActive('accordion')}
        onAction={() => editor.chain().focus().setAccordion().run()}
        title="Спойлер"
      />

      {/* Колонки */}
      <Popover open={columnsOpen} onOpenChange={setColumnsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8', editor.isActive('columns') && 'bg-muted')}
            title="Колонки"
          >
            <Columns2 className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                editor.chain().focus().setColumns(2).run()
                setColumnsOpen(false)
              }}
            >
              <Columns2 className="h-4 w-4" />2
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                editor.chain().focus().setColumns(3).run()
                setColumnsOpen(false)
              }}
            >
              <Columns3 className="h-4 w-4" />3
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}
