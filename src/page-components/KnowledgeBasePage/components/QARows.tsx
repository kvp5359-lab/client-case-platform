/**
 * Строки Q&A для дерева базы знаний — draggable (в группе) и недрагируемая
 * (без группы). Визуально зеркалят строки статей.
 */

import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { GripVertical, Trash2 } from 'lucide-react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { INDENT, BASE_PAD, ARTICLE_EXTRA } from '@/components/shared/tree/TreeConstants'
import { TreeConnector } from '@/components/shared/tree/TreeConnector'
import { TemplateAccessButton } from '@/components/knowledge/template-access/TemplateAccessButton'
import { NotionPill, getGroupColor } from '@/utils/notionPill'
import type { KnowledgeQA } from '@/services/api/knowledge/knowledgeSearchService'
import { IndexingStatusIcon } from '../KnowledgeQAComponents'

type QARowInner = {
  qa: KnowledgeQA
  depth: number
  workspaceId: string
  dropIndicator?: 'top' | 'bottom' | null
  onRowClick: (qa: KnowledgeQA) => void
  onDelete: (qa: KnowledgeQA) => void
}

function QARowBody({ qa, depth, workspaceId, dropIndicator, onRowClick, onDelete }: QARowInner) {
  return (
    <div
      className={`flex items-center gap-1.5 py-0.5 px-2 hover:bg-muted/50 rounded-sm group cursor-pointer ${
        dropIndicator ? 'bg-blue-50/40' : ''
      }`}
      style={{ paddingLeft: `${BASE_PAD + depth * INDENT + ARTICLE_EXTRA}px` }}
      onClick={() => onRowClick(qa)}
    >
      <span className="text-base truncate flex-1 min-w-0" title={qa.question}>
        {qa.question}
      </span>

      {qa.knowledge_qa_tags && qa.knowledge_qa_tags.length > 0 && (
        <span className="flex items-center gap-1 flex-shrink-0">
          {qa.knowledge_qa_tags.slice(0, 3).map((t) => {
            const c = getGroupColor(t.knowledge_tags.name, t.knowledge_tags.color)
            return (
              <NotionPill key={t.tag_id} name={t.knowledge_tags.name} bg={c.bg} text={c.text} />
            )
          })}
        </span>
      )}

      <IndexingStatusIcon status={qa.indexing_status} />
      <TemplateAccessButton
        entityId={qa.id}
        entityType="qa"
        workspaceId={workspaceId}
        mode={qa.template_access_mode}
      />

      <div
        className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          title="Удалить"
          onClick={() => onDelete(qa)}
        >
          <Trash2 className="w-3 h-3 text-red-500" />
        </Button>
      </div>
    </div>
  )
}

// ── Draggable (внутри группы) ──

export function SortableQARow({
  qa,
  depth,
  isLast,
  dropIndicator,
  workspaceId,
  onRowClick,
  onDelete,
}: {
  qa: KnowledgeQA
  depth: number
  isLast: boolean
  dropIndicator?: 'top' | 'bottom' | null
  workspaceId: string
  onRowClick: (qa: KnowledgeQA) => void
  onDelete: (qa: KnowledgeQA) => void
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: qa.id })
  const { setNodeRef: setDropRef } = useDroppable({ id: qa.id })

  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDragRef(node)
      setDropRef(node)
    },
    [setDragRef, setDropRef],
  )

  return (
    <div ref={mergedRef} className={`relative ${isDragging ? 'opacity-40' : ''}`}>
      {dropIndicator === 'top' && (
        <div className="absolute top-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10" />
      )}
      {dropIndicator === 'bottom' && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10" />
      )}
      {depth > 0 && <TreeConnector depth={depth} isLast={isLast} />}
      <div className="relative">
        <div
          className="absolute top-1/2 -translate-y-1/2 z-10 cursor-grab active:cursor-grabbing md:opacity-0 md:group-hover:opacity-100 transition-opacity"
          style={{ left: `${BASE_PAD + depth * INDENT + ARTICLE_EXTRA - 14}px` }}
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <QARowBody
          qa={qa}
          depth={depth}
          workspaceId={workspaceId}
          dropIndicator={dropIndicator}
          onRowClick={onRowClick}
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}

// ── Недрагируемая (без группы) ──

export function QARow({
  qa,
  depth,
  workspaceId,
  onRowClick,
  onDelete,
}: {
  qa: KnowledgeQA
  depth: number
  workspaceId: string
  onRowClick: (qa: KnowledgeQA) => void
  onDelete: (qa: KnowledgeQA) => void
}) {
  return (
    <div className="relative">
      {depth > 0 && <TreeConnector depth={depth} isLast />}
      <QARowBody
        qa={qa}
        depth={depth}
        workspaceId={workspaceId}
        onRowClick={onRowClick}
        onDelete={onDelete}
      />
    </div>
  )
}
