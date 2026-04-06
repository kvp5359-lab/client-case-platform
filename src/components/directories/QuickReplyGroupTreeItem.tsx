/**
 * QuickReplyGroupTreeItem — рекурсивный элемент дерева групп быстрых ответов.
 * По паттерну GroupTreeItem из базы знаний (те же отступы и коннекторы).
 */

import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Folder, FolderOpen, FolderPlus, Pencil, Trash2, LayoutTemplate } from 'lucide-react'
import {
  TemplateAccessPopover,
  TemplateAccessBadge,
} from '@/components/knowledge/TemplateAccessPopover'
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  type SensorDescriptor,
  type SensorOptions,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import type { QuickReplyGroup } from '@/hooks/useQuickReplyGroups'
import type { useQuickRepliesPage } from '@/hooks/useQuickRepliesPage'
import { INDENT, BASE_PAD, getLineX } from '@/components/shared/tree/TreeConstants'
import { TreeConnector } from '@/components/shared/tree/TreeConnector'
import { TreeEditingInput } from '@/components/shared/tree/TreeEditingInput'
import { AddSubgroupInput } from '@/components/shared/tree/AddSubgroupInput'
import { SortableReplyRow } from './QuickReplyRows'

export { ReplyRow } from './QuickReplyRows'

type PageReturn = ReturnType<typeof useQuickRepliesPage>

// ---------- Group tree item ----------

export function QuickReplyGroupTreeItem({
  group,
  groups,
  depth,
  page,
  collapsedGroups,
  toggleCollapse,
  isLast = false,
  sensors,
}: {
  group: QuickReplyGroup
  groups: QuickReplyGroup[]
  depth: number
  page: PageReturn
  collapsedGroups: Set<string>
  toggleCollapse: (id: string) => void
  isLast?: boolean
  sensors: SensorDescriptor<SensorOptions>[]
}) {
  const children = groups.filter((g) => g.parent_id === group.id)
  const replies = page.getRepliesForGroup(group.id)
  const hasContent = children.length > 0 || replies.length > 0
  const totalReplies = replies.length
  const isCollapsed = collapsedGroups.has(group.id)
  const isEditing = page.editingGroupId === group.id
  const isAddingChild = page.addingGroupParentId === group.id

  const FolderIcon = isCollapsed ? Folder : FolderOpen

  const reorderMutate = page.reorderRepliesMutation.mutate

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = replies.findIndex((r) => r.id === active.id)
      const newIndex = replies.findIndex((r) => r.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(replies, oldIndex, newIndex)
      reorderMutate({
        groupId: group.id,
        replyIds: reordered.map((r) => r.id),
      })
    },
    [replies, group.id, reorderMutate],
  )

  return (
    <div>
      {/* Group header row */}
      <div className="relative">
        {depth > 0 && (
          <TreeConnector depth={depth} isLast={isLast && (!hasContent || isCollapsed)} />
        )}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={!isCollapsed}
          className="flex items-center gap-1.5 h-7 px-2 hover:bg-muted/50 rounded-sm group cursor-pointer select-none"
          style={{ paddingLeft: `${BASE_PAD + depth * INDENT}px` }}
          onClick={() => toggleCollapse(group.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggleCollapse(group.id)
            }
          }}
        >
          <FolderIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />

          {isEditing ? (
            <TreeEditingInput
              value={page.editingGroupName}
              onChange={page.setEditingGroupName}
              onSave={page.handleSaveGroupEdit}
              onCancel={() => page.setEditingGroupId(null)}
            />
          ) : (
            <>
              <span className="text-sm font-medium truncate flex-1">
                {group.name}
                {totalReplies > 0 && (
                  <span className="text-muted-foreground font-normal ml-1">({totalReplies})</span>
                )}
              </span>
              <TemplateAccessBadge entityId={group.id} entityType="qr-group" />
              <div
                className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <TemplateAccessPopover
                  entityId={group.id}
                  entityType="qr-group"
                  workspaceId={page.workspaceId ?? ''}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    title="Доступ для типов проектов"
                  >
                    <LayoutTemplate className="w-3 h-3" />
                  </Button>
                </TemplateAccessPopover>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  title="Добавить шаблон"
                  onClick={() => page.openCreateReplyDialog(group.id)}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  title="Добавить подгруппу"
                  onClick={() => {
                    page.setAddingGroupParentId(group.id)
                    page.setNewGroupName('')
                  }}
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  title="Переименовать"
                  onClick={() => {
                    page.setEditingGroupId(group.id)
                    page.setEditingGroupName(group.name)
                  }}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  title="Удалить"
                  onClick={() => page.handleDeleteGroup(group.id, group.name)}
                >
                  <Trash2 className="w-3 h-3 text-red-500" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Inline add subgroup */}
      {isAddingChild && (
        <AddSubgroupInput
          depth={depth}
          value={page.newGroupName}
          onChange={page.setNewGroupName}
          onSave={page.handleCreateGroup}
          onCancel={() => page.setAddingGroupParentId(null)}
          isSaving={page.createGroupMutation.isPending}
        />
      )}

      {/* Children: subgroups + sortable replies */}
      {!isCollapsed && hasContent && (
        <div className="relative">
          {depth > 0 && !isLast && (
            <div
              className="absolute top-0 bottom-0 border-l border-border/50"
              style={{ left: `${getLineX(depth)}px` }}
            />
          )}
          {children.map((child, i) => {
            const isLastChild = i === children.length - 1 && replies.length === 0
            return (
              <QuickReplyGroupTreeItem
                key={child.id}
                group={child}
                groups={groups}
                depth={depth + 1}
                page={page}
                collapsedGroups={collapsedGroups}
                toggleCollapse={toggleCollapse}
                isLast={isLastChild}
                sensors={sensors}
              />
            )
          })}
          {replies.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={replies.map((r) => r.id)}
                strategy={verticalListSortingStrategy}
              >
                {replies.map((reply, i) => (
                  <SortableReplyRow
                    key={reply.id}
                    reply={reply}
                    depth={depth + 1}
                    page={page}
                    isLast={i === replies.length - 1}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}
    </div>
  )
}
