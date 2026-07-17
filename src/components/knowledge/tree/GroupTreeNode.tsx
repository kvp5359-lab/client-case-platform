/**
 * Обобщённый узел дерева групп (порт GroupTreeItem, adapter-driven).
 * Рендерит заголовок группы + подгруппы + строки элементов через source.
 */

import { Button } from '@/components/ui/button'
import { Plus, Folder, FolderOpen, FolderPlus, Pencil, Trash2 } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { TemplateAccessButton } from '@/components/knowledge/template-access/TemplateAccessButton'
import { INDENT, BASE_PAD, getLineX } from '@/components/shared/tree/TreeConstants'
import { TreeConnector } from '@/components/shared/tree/TreeConnector'
import { AddSubgroupInput } from '@/components/shared/tree/AddSubgroupInput'
import type { TreeSource, TreeGroupData, DropIndicatorState } from './types'

export function GroupTreeNode<Item extends { id: string }>({
  group,
  source,
  depth,
  collapsedGroups,
  toggleCollapse,
  deepCounts,
  isLast = false,
  overGroupId,
  dropIndicator,
}: {
  group: TreeGroupData
  source: TreeSource<Item>
  depth: number
  collapsedGroups: Set<string>
  toggleCollapse: (id: string) => void
  /** Счётчики «элементы группы + все подгруппы», считаются один раз в GroupTreeBody */
  deepCounts: Map<string, number>
  isLast?: boolean
  overGroupId?: string | null
  dropIndicator?: DropIndicatorState | null
}) {
  const allChildren = source.groups.filter((g) => g.parent_id === group.id)
  const children = source.filterChildren
    ? allChildren.filter((c) => source.filterChildren!(c.id))
    : allChildren
  const items = source.getItemsForGroup(group.id)
  const hasContent = children.length > 0 || items.length > 0
  const totalItems = deepCounts.get(group.id) ?? items.length
  // При активном поиске свёрнутость игнорируем — иначе найденное прячется в свёрнутых группах
  const isCollapsed = !source.isSearchActive && collapsedGroups.has(group.id)
  const isAddingChild = source.addingGroupParentId === group.id
  const isDropTarget = overGroupId === group.id

  const FolderIcon = isCollapsed ? Folder : FolderOpen
  const { setNodeRef } = useDroppable({ id: `group:${group.id}` })

  return (
    <div>
      {/* Заголовок группы */}
      <div className="relative" ref={setNodeRef}>
        {depth > 0 && <TreeConnector depth={depth} isLast={isLast && (!hasContent || isCollapsed)} />}
        <div
          className={`flex items-center gap-1.5 py-0.5 px-2 hover:bg-muted/50 rounded-sm group cursor-pointer select-none transition-colors ${
            isDropTarget ? 'bg-primary/10 ring-1 ring-primary/30' : ''
          }`}
          style={{ paddingLeft: `${BASE_PAD + depth * INDENT}px` }}
          onClick={() => toggleCollapse(group.id)}
        >
          <FolderIcon className="w-4 h-4 flex-shrink-0" style={{ color: group.color || undefined }} />
          <span className="text-base font-semibold truncate">
            {group.name}
            {totalItems > 0 && (
              <span className="text-muted-foreground font-normal ml-1">({totalItems})</span>
            )}
          </span>
          <div
            className="flex items-center gap-0.5 md:invisible md:group-hover:visible transition-all ml-1 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground/50 hover:text-foreground hover:bg-muted"
              title={source.addItemTitle}
              onClick={() => source.onAddItem(group.id)}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground/50 hover:text-foreground hover:bg-muted"
              title="Добавить подгруппу"
              onClick={() => {
                source.setAddingGroupParentId(group.id)
                source.setNewGroupName('')
              }}
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground/50 hover:text-foreground hover:bg-muted"
              title="Редактировать"
              onClick={() => source.onEditGroup(group)}
            >
              <Pencil className="w-3 h-3" />
            </Button>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <TemplateAccessButton
              entityId={group.id}
              entityType="group"
              workspaceId={source.workspaceId}
              mode={group.template_access_mode}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground/50 hover:text-destructive hover:bg-muted md:invisible md:group-hover:visible transition-all"
              title="Удалить"
              onClick={() => source.onDeleteGroup(group)}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Inline-добавление подгруппы */}
      {isAddingChild && (
        <AddSubgroupInput
          depth={depth}
          value={source.newGroupName}
          onChange={source.setNewGroupName}
          onSave={source.onCreateGroup}
          onCancel={() => source.setAddingGroupParentId(null)}
          isSaving={source.createGroupPending}
        />
      )}

      {/* Подгруппы + элементы */}
      {!isCollapsed && hasContent && (
        <div className="relative">
          {depth > 0 && !isLast && (
            <div
              className="absolute top-0 bottom-0 border-l border-border/50"
              style={{ left: `${getLineX(depth)}px` }}
            />
          )}
          {children.map((child, i) => (
            <GroupTreeNode
              key={child.id}
              group={child}
              source={source}
              depth={depth + 1}
              collapsedGroups={collapsedGroups}
              toggleCollapse={toggleCollapse}
              deepCounts={deepCounts}
              isLast={i === children.length - 1 && items.length === 0}
              overGroupId={overGroupId}
              dropIndicator={dropIndicator}
            />
          ))}
          {items.map((item, i) =>
            source.renderItemRow({
              item,
              depth: depth + 1,
              isLast: i === items.length - 1,
              dropPosition: dropIndicator?.itemId === item.id ? dropIndicator.position : null,
            }),
          )}
        </div>
      )}
    </div>
  )
}
