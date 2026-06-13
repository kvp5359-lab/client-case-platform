"use client"

/**
 * Перетаскиваемая строка структурного блока плана (заголовок/текст) в списке
 * шаблонов задач проекта. Вынесена из ProjectTemplateThreadList.
 */

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HeadingBlockBody, TextBlockBody, htmlToPlain } from '@/components/plan/PlanBlockItem'
import type { TemplatePlanBlockRow } from '@/types/plan'

export function SortableContentRow({
  block,
  onChangeContent,
  onDelete,
}: {
  block: TemplatePlanBlockRow
  onChangeContent: (content: string) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  })
  const [editingText, setEditingText] = useState(false)

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  }

  const plain = htmlToPlain(block.content ?? '')

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 px-2 rounded group hover:bg-muted/60 transition-colors py-1"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none p-0.5 -m-0.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        aria-label="Переупорядочить"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      <div className="min-w-0 flex-1">
        {block.block_type === 'heading' ? (
          <HeadingBlockBody content={block.content} editing onChange={onChangeContent} />
        ) : editingText ? (
          <TextBlockBody
            content={block.content}
            onChange={onChangeContent}
            onClose={() => setEditingText(false)}
          />
        ) : (
          <div
            className="cursor-text rounded -mx-1 px-1 py-0.5 hover:bg-muted/50"
            role="button"
            tabIndex={0}
            onClick={() => setEditingText(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                setEditingText(true)
              }
            }}
          >
            {plain ? (
              <p className="text-sm whitespace-pre-wrap">{plain}</p>
            ) : (
              <p className="text-sm italic text-muted-foreground">
                Нажмите, чтобы добавить текст
              </p>
            )}
          </div>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        onClick={onDelete}
        title="Удалить"
      >
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  )
}
