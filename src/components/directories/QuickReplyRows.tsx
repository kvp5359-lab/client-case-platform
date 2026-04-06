/**
 * QuickReplyRows — компоненты строк быстрых ответов в дереве.
 * Извлечены из QuickReplyGroupTreeItem для декомпозиции.
 */

import { Button } from '@/components/ui/button'
import { Pencil, Trash2, GripVertical, LayoutTemplate, FileText } from 'lucide-react'
import {
  TemplateAccessPopover,
  TemplateAccessBadge,
} from '@/components/knowledge/TemplateAccessPopover'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { QuickReply } from '@/hooks/useQuickReplies'
import type { useQuickRepliesPage } from '@/hooks/useQuickRepliesPage'
import { INDENT, BASE_PAD, ARTICLE_EXTRA } from '@/components/shared/tree/TreeConstants'
import { TreeConnector } from '@/components/shared/tree/TreeConnector'

type PageReturn = ReturnType<typeof useQuickRepliesPage>

/** Убирает HTML-теги для превью (DOMParser безопаснее innerHTML — не загружает ресурсы) */
function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent || ''
}

// ---------- Shared reply row content ----------

/** Общий контент строки ответа — переиспользуется в SortableReplyRow и ReplyRow */
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
      <span className="text-sm truncate flex-1">{reply.name}</span>
      {preview && (
        <span className="text-xs text-muted-foreground truncate max-w-[400px] hidden sm:inline">
          {preview}
        </span>
      )}

      <TemplateAccessBadge entityId={reply.id} entityType="qr-reply" />

      <div
        className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <TemplateAccessPopover
          entityId={reply.id}
          entityType="qr-reply"
          workspaceId={page.workspaceId ?? ''}
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            title="Доступ для типов проектов"
          >
            <LayoutTemplate className="w-3 h-3" />
          </Button>
        </TemplateAccessPopover>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          title="Редактировать"
          onClick={() => page.openEditReply(reply)}
        >
          <Pencil className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          title="Удалить"
          onClick={() => page.handleDeleteReply(reply.id, reply.name)}
        >
          <Trash2 className="w-3 h-3 text-red-500" />
        </Button>
      </div>
    </>
  )
}

// ---------- Sortable reply row ----------

export function SortableReplyRow({
  reply,
  depth,
  page,
  isLast,
}: {
  reply: QuickReply
  depth: number
  page: PageReturn
  isLast: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: reply.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const preview = stripHtml(reply.content).slice(0, 60)

  return (
    <div ref={setNodeRef} style={style} className="relative">
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

// ---------- Non-sortable reply row (ungrouped) ----------

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
