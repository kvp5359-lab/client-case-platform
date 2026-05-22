/**
 * QuickReplyGroupTreeItem — рекурсивный элемент дерева групп быстрых ответов.
 * По паттерну GroupTreeItem из базы знаний (те же отступы и коннекторы).
 */

import { Button } from '@/components/ui/button'
import { Plus, Folder, FolderOpen, FolderPlus, Pencil, Trash2 } from 'lucide-react'
import { TemplateAccessButton } from '@/components/knowledge/TemplateAccessPopover'
import { useDroppable } from '@dnd-kit/core'
import type { QuickReplyGroup } from '@/hooks/useQuickReplyGroups'
import type { useQuickRepliesPage } from '@/hooks/useQuickRepliesPage'
import { INDENT, BASE_PAD, getLineX } from '@/components/shared/tree/TreeConstants'
import { TreeConnector } from '@/components/shared/tree/TreeConnector'
import { TreeEditingInput } from '@/components/shared/tree/TreeEditingInput'
import { AddSubgroupInput } from '@/components/shared/tree/AddSubgroupInput'
import { DraggableReplyRow } from './QuickReplyRows'
import { GROUP_DROP_PREFIX, type DropIndicatorState } from './useQuickReplyDnd'

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
  overGroupId,
  dropIndicator,
  isLast = false,
}: {
  group: QuickReplyGroup
  groups: QuickReplyGroup[]
  depth: number
  page: PageReturn
  collapsedGroups: Set<string>
  toggleCollapse: (id: string) => void
  overGroupId: string | null
  dropIndicator: DropIndicatorState | null
  isLast?: boolean
}) {
  const children = groups.filter((g) => g.parent_id === group.id)
  const replies = page.getRepliesForGroup(group.id)
  const hasContent = children.length > 0 || replies.length > 0
  const totalReplies = replies.length
  const isCollapsed = collapsedGroups.has(group.id)
  const isEditing = page.editingGroupId === group.id
  const isAddingChild = page.addingGroupParentId === group.id

  const FolderIcon = isCollapsed ? Folder : FolderOpen

  // Droppable-зона для «бросить шаблон в группу»
  const { setNodeRef: setDropRef } = useDroppable({
    id: `${GROUP_DROP_PREFIX}${group.id}`,
  })
  const isOver = overGroupId === group.id

  return (
    <div>
      {/* Group header row */}
      <div className="relative">
        {depth > 0 && (
          <TreeConnector depth={depth} isLast={isLast && (!hasContent || isCollapsed)} />
        )}
        <div
          ref={setDropRef}
          role="button"
          tabIndex={0}
          aria-expanded={!isCollapsed}
          className={`flex items-center gap-1.5 h-7 px-2 hover:bg-muted/50 rounded-sm group cursor-pointer select-none ${
            isOver ? 'bg-amber-100/70 dark:bg-amber-900/20 ring-1 ring-amber-400' : ''
          }`}
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
              {/* Колонка 1: название + иконки (фиксированная ширина — выровнена с шаблонами) */}
              <div className="flex items-center gap-0.5 w-[280px] flex-shrink-0">
                <span className="text-sm font-medium truncate">
                  {group.name}
                  {totalReplies > 0 && (
                    <span className="text-muted-foreground font-normal ml-1">
                      ({totalReplies})
                    </span>
                  )}
                </span>
                <div
                  className="flex items-center flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <TemplateAccessButton
                    entityId={group.id}
                    entityType="qr-group"
                    workspaceId={page.workspaceId ?? ''}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-foreground"
                    title="Добавить шаблон"
                    onClick={() => page.openCreateReplyDialog(group.id)}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-foreground"
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
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-foreground"
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
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-red-500"
                    title="Удалить"
                    onClick={() => page.handleDeleteGroup(group.id, group.name)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
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
                overGroupId={overGroupId}
                dropIndicator={dropIndicator}
                isLast={isLastChild}
              />
            )
          })}
          {replies.map((reply, i) => (
            <DraggableReplyRow
              key={reply.id}
              reply={reply}
              depth={depth + 1}
              page={page}
              isLast={i === replies.length - 1}
              dropIndicator={
                dropIndicator?.replyId === reply.id ? dropIndicator.position : null
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
