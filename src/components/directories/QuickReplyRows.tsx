/**
 * QuickReplyRows — компоненты строк быстрых ответов в дереве.
 * DnD по паттерну базы знаний: useDraggable + useDroppable, без SortableContext.
 * При перетаскивании дерево не сдвигается; место вставки показывает голубая полоса.
 */

import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2, GripVertical, FileText } from 'lucide-react'
import { TemplateAccessButton } from '@/components/knowledge/template-access/TemplateAccessButton'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { QuickReply } from '@/hooks/quick-replies/useQuickReplies'
import type { useQuickRepliesPage } from '@/hooks/quick-replies/useQuickRepliesPage'
import { INDENT, BASE_PAD, ARTICLE_EXTRA } from '@/components/shared/tree/TreeConstants'
import { TreeConnector } from '@/components/shared/tree/TreeConnector'

type PageReturn = ReturnType<typeof useQuickRepliesPage>

/** Убирает HTML-теги для превью */
function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent || ''
}

// ---------- Shared reply row content ----------

function ReplyRowContent({
  reply,
  page,
  preview,
}: {
  reply: QuickReply
  page: PageReturn
  preview: string
}) {
  return (
    <>
      <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />

      {/* Колонка 1: название + иконки (фиксированная ширина → описания выровнены) */}
      <div className="flex items-center gap-0.5 w-[280px] flex-shrink-0">
        <span className="text-sm truncate">{reply.name}</span>
        <div
          className="flex items-center flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <TemplateAccessButton
            entityId={reply.id}
            entityType="qr-reply"
            workspaceId={page.workspaceId ?? ''}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-foreground"
            title="Редактировать"
            onClick={() => page.openEditReply(reply)}
          >
            <Pencil className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-red-500"
            title="Удалить"
            onClick={() => page.handleDeleteReply(reply.id, reply.name)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Колонка 2: описание */}
      <div className="flex-1 min-w-0 hidden sm:block">
        {preview && (
          <span className="text-xs text-muted-foreground/60 truncate block">{preview}</span>
        )}
      </div>
    </>
  )
}

// ---------- Draggable + droppable reply row ----------

export function DraggableReplyRow({
  reply,
  depth,
  page,
  isLast,
  dropIndicator,
}: {
  reply: QuickReply
  depth: number
  page: PageReturn
  isLast: boolean
  dropIndicator?: 'top' | 'bottom' | null
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: reply.id })
  const { setNodeRef: setDropRef } = useDroppable({ id: reply.id })

  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDragRef(node)
      setDropRef(node)
    },
    [setDragRef, setDropRef],
  )

  const preview = stripHtml(reply.content).slice(0, 60)

  return (
    <div ref={mergedRef} className={`relative ${isDragging ? 'opacity-40' : ''}`}>
      {dropIndicator === 'top' && (
        <div className="absolute top-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10" />
      )}
      {dropIndicator === 'bottom' && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10" />
      )}
      {depth > 0 && <TreeConnector depth={depth} isLast={isLast} />}
      <div
        role="button"
        tabIndex={0}
        className={`flex items-center gap-1.5 h-7 px-2 hover:bg-muted/50 rounded-sm group cursor-pointer ${
          dropIndicator ? 'bg-blue-50/40' : ''
        }`}
        style={{ paddingLeft: `${BASE_PAD + depth * INDENT + ARTICLE_EXTRA}px` }}
        onClick={() => page.openEditReply(reply)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            page.openEditReply(reply)
          }
        }}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `${BASE_PAD + depth * INDENT + ARTICLE_EXTRA - 14}px` }}
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <ReplyRowContent reply={reply} page={page} preview={preview} />
      </div>
    </div>
  )
}

// ---------- Non-draggable reply row (для read-only сценариев, если понадобится) ----------

export function ReplyRow({
  reply,
  depth,
  page,
  isLast = false,
}: {
  reply: QuickReply
  depth: number
  page: PageReturn
  isLast?: boolean
}) {
  const preview = stripHtml(reply.content).slice(0, 60)

  return (
    <div className="relative">
      {depth > 0 && <TreeConnector depth={depth} isLast={isLast} />}
      <div
        role="button"
        tabIndex={0}
        className="flex items-center gap-1.5 h-7 px-2 hover:bg-muted/50 rounded-sm group cursor-pointer"
        style={{ paddingLeft: `${BASE_PAD + depth * INDENT + ARTICLE_EXTRA}px` }}
        onClick={() => page.openEditReply(reply)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            page.openEditReply(reply)
          }
        }}
      >
        <ReplyRowContent reply={reply} page={page} preview={preview} />
      </div>
    </div>
  )
}
