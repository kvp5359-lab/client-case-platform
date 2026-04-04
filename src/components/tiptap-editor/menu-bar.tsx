"use client"

import { useState, useRef } from 'react'
import { type Editor } from '@tiptap/react'
import { RemoveFormatting, Maximize2, Minimize2, ImagePlus } from 'lucide-react'
import { Toggle } from '@/components/ui/toggle'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  HistoryGroup,
  HeadingsGroup,
  TextFormattingGroup,
  AlignmentGroup,
  ListsGroup,
  BlocksGroup,
  TablePopover,
  LinkPopover,
} from './menu-bar/index'

interface MenuBarProps {
  editor: Editor | null
  className?: string
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  /** Callback для загрузки изображения через файловый диалог */
  onImageUpload?: (file: File) => Promise<string>
}

export function MenuBar({
  editor,
  className,
  isFullscreen,
  onToggleFullscreen,
  onImageUpload,
}: MenuBarProps) {
  const [tablePopoverOpen, setTablePopoverOpen] = useState(false)
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  if (!editor) {
    return null
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1 p-2 border-b bg-muted/30',
        isFullscreen && 'sticky top-0 z-10 bg-white dark:bg-background',
        className,
      )}
    >
      {/* History: Undo/Redo */}
      <HistoryGroup editor={editor} />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Headings: H1, H2, H3 */}
      <HeadingsGroup editor={editor} />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Text formatting: Bold, Italic, Underline, Strike, Colors */}
      <TextFormattingGroup editor={editor} />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Alignment: Left, Center, Right, Justify */}
      <AlignmentGroup editor={editor} />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Lists: Bullet, Ordered */}
      <ListsGroup editor={editor} />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Blocks: Quote, Code, HorizontalRule */}
      <BlocksGroup editor={editor} />

      {/* Table */}
      <TablePopover editor={editor} open={tablePopoverOpen} onOpenChange={setTablePopoverOpen} />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Link */}
      <LinkPopover editor={editor} open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen} />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Image upload */}
      {onImageUpload && (
        <>
          <Toggle
            size="sm"
            pressed={false}
            onMouseDown={(e) => {
              e.preventDefault()
              imageInputRef.current?.click()
            }}
            title="Вставить изображение"
          >
            <ImagePlus className="h-4 w-4" />
          </Toggle>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file || !editor) return
              e.target.value = ''
              try {
                const url = await onImageUpload(file)
                const saved = (() => {
                  try {
                    return JSON.parse(localStorage.getItem('imageBlock:lastStyle') || '{}')
                  } catch {
                    return {}
                  }
                })()
                editor
                  .chain()
                  .focus()
                  .setImageBlock({
                    src: url,
                    alt: file.name,
                    rounded: saved.rounded || 'lg',
                    borderWidth: saved.borderWidth || 'none',
                    borderColor: saved.borderColor || '#d1d5db',
                    shadow: saved.shadow || 'none',
                  })
                  .run()
              } catch {
                // ошибка обрабатывается в uploadImageToStorage
              }
            }}
          />

          <Separator orientation="vertical" className="mx-1 h-6" />
        </>
      )}

      {/* Clear formatting */}
      <Toggle
        size="sm"
        pressed={false}
        onMouseDown={(e) => {
          e.preventDefault()
          editor.chain().focus().clearNodes().unsetAllMarks().run()
        }}
        title="Очистить форматирование"
      >
        <RemoveFormatting className="h-4 w-4" />
      </Toggle>

      {/* Fullscreen toggle */}
      {onToggleFullscreen && (
        <>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <Toggle
            size="sm"
            pressed={isFullscreen}
            onMouseDown={(e) => {
              e.preventDefault()
              onToggleFullscreen()
            }}
            title={isFullscreen ? 'Выйти из полноэкранного режима (Esc)' : 'Полноэкранный режим'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Toggle>
        </>
      )}
    </div>
  )
}
