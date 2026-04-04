"use client"

import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Bold, Italic, Underline, Strikethrough, Highlighter, Palette } from 'lucide-react'
import { ToolbarButton } from './toolbar-button'
import { ColorPicker } from './color-picker'
import { TEXT_COLORS, HIGHLIGHT_COLORS } from './constants'

interface TextFormattingGroupProps {
  editor: Editor
}

export function TextFormattingGroup({ editor }: TextFormattingGroupProps) {
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false)
  const [highlightPopoverOpen, setHighlightPopoverOpen] = useState(false)

  // Получаем текущий цвет текста
  const currentColor = editor.getAttributes('textStyle').color || null
  // Получаем текущий цвет выделения
  const currentHighlight = editor.getAttributes('highlight').color || null

  return (
    <>
      <ToolbarButton
        icon={Bold}
        isActive={editor.isActive('bold')}
        onAction={() => editor.chain().focus().toggleBold().run()}
        title="Жирный"
      />
      <ToolbarButton
        icon={Italic}
        isActive={editor.isActive('italic')}
        onAction={() => editor.chain().focus().toggleItalic().run()}
        title="Курсив"
      />
      <ToolbarButton
        icon={Underline}
        isActive={editor.isActive('underline')}
        onAction={() => editor.chain().focus().toggleUnderline().run()}
        title="Подчёркнутый"
      />
      <ToolbarButton
        icon={Strikethrough}
        isActive={editor.isActive('strike')}
        onAction={() => editor.chain().focus().toggleStrike().run()}
        title="Зачёркнутый"
      />

      {/* Highlight Color */}
      <ColorPicker
        colors={HIGHLIGHT_COLORS}
        currentColor={currentHighlight}
        open={highlightPopoverOpen}
        onOpenChange={setHighlightPopoverOpen}
        onSelect={(color) => {
          if (color) {
            editor.chain().focus().setHighlight({ color }).run()
          } else {
            editor.chain().focus().unsetHighlight().run()
          }
        }}
        icon={<Highlighter className="h-4 w-4" />}
        title="Выделение (маркер)"
        isActive={editor.isActive('highlight')}
      />

      {/* Text Color */}
      <ColorPicker
        colors={TEXT_COLORS}
        currentColor={currentColor}
        open={colorPopoverOpen}
        onOpenChange={setColorPopoverOpen}
        onSelect={(color) => {
          if (color) {
            editor.chain().focus().setColor(color).run()
          } else {
            editor.chain().focus().unsetColor().run()
          }
        }}
        icon={<Palette className="h-4 w-4" />}
        title="Цвет текста"
      />
    </>
  )
}
