/**
 * Обобщённое тело дерева базы знаний: DnD-контекст + корневые группы +
 * зона «без группы» + drag-overlay. Работает и для статей, и для Q&A через
 * TreeSource-адаптер.
 */

import { useState } from 'react'
import { DndContext, DragOverlay, pointerWithin, useDroppable } from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FolderPlus, Check, X } from 'lucide-react'
import { GroupTreeNode } from './GroupTreeNode'
import { useGroupTreeDnd, UNGROUPED_ID } from './useGroupTreeDnd'
import type { TreeSource } from './types'

export function GroupTreeBody<Item extends { id: string }>({
  source,
}: {
  source: TreeSource<Item>
}) {
  const dnd = useGroupTreeDnd(source)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const toggleCollapse = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const rootGroups = source.groups.filter((g) => !g.parent_id)

  // Рекурсивно: есть ли в группе (или потомках) отфильтрованные элементы
  function groupHasMatches(groupId: string): boolean {
    if (source.getItemsForGroup(groupId).length > 0) return true
    return source.groups.filter((g) => g.parent_id === groupId).some((c) => groupHasMatches(c.id))
  }

  const visibleRootGroups = source.isSearchActive
    ? rootGroups.filter((g) => groupHasMatches(g.id))
    : rootGroups

  return (
    <DndContext
      sensors={dnd.sensors}
      collisionDetection={pointerWithin}
      onDragStart={dnd.handleDragStart}
      onDragOver={dnd.handleDragOver}
      onDragEnd={dnd.handleDragEnd}
      onDragCancel={dnd.handleDragCancel}
    >
      <div className="border rounded-lg py-1">
        {/* Inline-добавление корневой группы */}
        {source.addingGroupParentId === 'root' && (
          <div className="flex items-center gap-1.5 h-7 px-2" style={{ paddingLeft: '8px' }}>
            <FolderPlus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <Input
              value={source.newGroupName}
              onChange={(e) => source.setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') source.onCreateGroup()
                if (e.key === 'Escape') source.setAddingGroupParentId(null)
              }}
              placeholder="Название группы..."
              className="h-6 text-sm flex-1"
              autoFocus
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={source.onCreateGroup}
              disabled={!source.newGroupName.trim() || source.createGroupPending}
              className="h-6 w-6 p-0"
            >
              <Check className="w-3.5 h-3.5 text-green-600" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => source.setAddingGroupParentId(null)}
              className="h-6 w-6 p-0"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {/* Корневые группы */}
        {visibleRootGroups.map((group) => (
          <GroupTreeNode
            key={group.id}
            group={group}
            source={source}
            depth={0}
            collapsedGroups={collapsedGroups}
            toggleCollapse={toggleCollapse}
            overGroupId={dnd.overGroupId}
            dropIndicator={dnd.dropIndicator}
          />
        ))}

        {/* Без группы */}
        {(source.ungroupedItems.length > 0 || dnd.activeItem) && rootGroups.length > 0 && (
          <UngroupedZone isOver={dnd.overGroupId === UNGROUPED_ID}>
            <div className="border-t mt-1 pt-1">
              <div className="flex items-center gap-1.5 h-6 px-2 pl-[8px]">
                <span className="text-xs text-muted-foreground font-medium">Без группы</span>
              </div>
            </div>
            {source.ungroupedItems.map((item) =>
              source.renderItemRow({ item, depth: 0, isLast: false, dropPosition: null }),
            )}
          </UngroupedZone>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {dnd.activeItem && source.renderDragOverlay(dnd.activeItem)}
      </DragOverlay>
    </DndContext>
  )
}

function UngroupedZone({ children, isOver }: { children: React.ReactNode; isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id: UNGROUPED_ID })
  return (
    <div
      ref={setNodeRef}
      className={`transition-colors rounded-sm ${isOver ? 'bg-blue-50/40 ring-1 ring-blue-300' : ''}`}
    >
      {children}
    </div>
  )
}
