"use client"

import { NodeViewWrapper, NodeViewContent, NodeViewProps } from '@tiptap/react'
import { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Trash2, ChevronDown, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AccordionView({ node, updateAttributes, selected, deleteNode }: NodeViewProps) {
  const title = (node.attrs.title as string) || 'Заголовок'
  const isOpen = (node.attrs.open as boolean) ?? true
  const [editTitle, setEditTitle] = useState(false)
  const [titleInput, setTitleInput] = useState(title)

  // Анимация раскрытия без обрезки контента. Раньше стоял фиксированный
  // max-h-[2000px] — контент выше 2000px (много шагов/скринов) прятался внутри
  // спойлера. Теперь: закрыт → 0; при раскрытии анимируем 0 → измеренная высота,
  // затем снимаем лимит (none), чтобы не резать даже при дозагрузке картинок.
  const contentRef = useRef<HTMLDivElement>(null)
  const [maxHeight, setMaxHeight] = useState<string>(isOpen ? 'none' : '0px')
  const firstRun = useRef(true)
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    if (isOpen) {
      setMaxHeight(`${el.scrollHeight}px`)
      const t = window.setTimeout(() => setMaxHeight('none'), 220)
      return () => window.clearTimeout(t)
    }
    setMaxHeight(`${el.scrollHeight}px`)
    const r = requestAnimationFrame(() => setMaxHeight('0px'))
    return () => cancelAnimationFrame(r)
  }, [isOpen])

  const handleSaveTitle = () => {
    updateAttributes({ title: titleInput })
    setEditTitle(false)
  }

  return (
    <NodeViewWrapper
      className={cn('my-4 not-prose', selected && 'ring-2 ring-primary ring-offset-2 rounded-lg')}
    >
      <div className="relative group border rounded-lg overflow-hidden">
        {/* Header */}
        <div
          className={cn(
            'flex items-center justify-between px-4 py-3 bg-muted/30 cursor-pointer select-none',
            isOpen && 'border-b',
          )}
          onClick={() => updateAttributes({ open: !isOpen })}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <ChevronDown
              className={cn('h-4 w-4 flex-shrink-0 transition-transform', isOpen && 'rotate-180')}
            />
            {editTitle ? (
              <div className="flex gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                <Input
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="h-7 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleSaveTitle()
                    }
                    if (e.key === 'Escape') {
                      setTitleInput(title)
                      setEditTitle(false)
                    }
                  }}
                  onBlur={handleSaveTitle}
                />
              </div>
            ) : (
              <span className="font-medium truncate">{title}</span>
            )}
          </div>

          {/* Edit title button */}
          {!editTitle && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setEditTitle(true)
              }}
              className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
              title="Редактировать заголовок"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}

          {/* Delete button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              deleteNode()
            }}
            className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"
            title="Удалить блок"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>

        {/* Content */}
        <div
          ref={contentRef}
          style={{ maxHeight }}
          className={cn(
            'accordion-content overflow-hidden transition-[max-height,opacity] duration-200',
            isOpen ? 'opacity-100' : 'opacity-0',
          )}
        >
          <NodeViewContent className="px-4 py-3 focus:outline-none [&>p]:m-0 [&>p:not(:last-child)]:mb-2" />
        </div>
      </div>
    </NodeViewWrapper>
  )
}
