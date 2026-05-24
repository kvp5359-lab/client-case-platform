/**
 * QuickReplyTreeView — дерево групп и шаблонов быстрых ответов.
 * DnD по паттерну базы знаний: статическое дерево, голубая полоса
 * показывает место вставки, DragOverlay рисует плашку под курсором.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, FolderPlus, Zap, Check, X, FileText } from 'lucide-react'
import { DndContext, DragOverlay, pointerWithin, useDroppable } from '@dnd-kit/core'
import { QuickReplyGroupTreeItem } from './QuickReplyGroupTreeItem'
import { DraggableReplyRow } from './QuickReplyRows'
import { useQuickReplyDnd, UNGROUPED_ID } from './useQuickReplyDnd'
import type { useQuickRepliesPage } from '@/hooks/quick-replies/useQuickRepliesPage'

type PageReturn = ReturnType<typeof useQuickRepliesPage>

function UngroupedDropZone({
  children,
  isOver,
}: {
  children: React.ReactNode
  isOver: boolean
}) {
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

export function QuickReplyTreeView({ page }: { page: PageReturn }) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const dnd = useQuickReplyDnd(page)

  const toggleCollapse = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const rootGroups = page.groups.filter((g) => !g.parent_id)
  const isLoading = page.repliesLoading || page.groupsQuery.isLoading

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск шаблонов..."
            className="pl-9"
            value={page.searchQuery}
            onChange={(e) => page.setSearchQuery(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            page.setAddingGroupParentId('root')
            page.setNewGroupName('')
          }}
        >
          <FolderPlus className="w-4 h-4 mr-1.5" />
          Группа
        </Button>
        <Button
          size="sm"
          onClick={() => page.openCreateReplyDialog(null)}
          disabled={page.createReplyMutation.isPending}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Шаблон
        </Button>
      </div>

      {/* Tree */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Загрузка...</div>
      ) : page.groups.length === 0 && page.replies.length === 0 ? (
        <div className="border rounded-lg p-12">
          <div className="text-center">
            <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Нет шаблонов</h3>
            <p className="text-muted-foreground mb-4">
              Создайте первую группу или шаблон быстрого ответа
            </p>
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  page.setAddingGroupParentId('root')
                  page.setNewGroupName('')
                }}
              >
                <FolderPlus className="w-4 h-4 mr-2" />
                Создать группу
              </Button>
              <Button onClick={() => page.openCreateReplyDialog(null)}>
                <Plus className="w-4 h-4 mr-2" />
                Создать шаблон
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <DndContext
          sensors={dnd.sensors}
          collisionDetection={pointerWithin}
          onDragStart={dnd.handleDragStart}
          onDragOver={dnd.handleDragOver}
          onDragEnd={dnd.handleDragEnd}
          onDragCancel={dnd.handleDragCancel}
        >
          <div className="border rounded-lg py-1">
            {/* Inline add root group */}
            {page.addingGroupParentId === 'root' && (
              <div className="flex items-center gap-1.5 h-7 px-2" style={{ paddingLeft: '8px' }}>
                <FolderPlus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <Input
                  value={page.newGroupName}
                  onChange={(e) => page.setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') page.handleCreateGroup()
                    if (e.key === 'Escape') page.setAddingGroupParentId(null)
                  }}
                  placeholder="Название группы..."
                  className="h-6 text-sm flex-1"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={page.handleCreateGroup}
                  disabled={!page.newGroupName.trim() || page.createGroupMutation.isPending}
                  className="h-6 w-6 p-0"
                >
                  <Check className="w-3.5 h-3.5 text-green-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => page.setAddingGroupParentId(null)}
                  className="h-6 w-6 p-0"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            {/* Root groups */}
            {rootGroups.map((group) => (
              <QuickReplyGroupTreeItem
                key={group.id}
                group={group}
                groups={page.groups}
                depth={0}
                page={page}
                collapsedGroups={collapsedGroups}
                toggleCollapse={toggleCollapse}
                overGroupId={dnd.overGroupId}
                dropIndicator={dnd.dropIndicator}
              />
            ))}

            {/* Ungrouped replies */}
            {(page.ungroupedReplies.length > 0 || dnd.activeReply) && (
              <UngroupedDropZone isOver={dnd.overGroupId === UNGROUPED_ID}>
                {rootGroups.length > 0 && (
                  <div className="border-t mt-1 pt-1">
                    <div className="flex items-center gap-1.5 h-6 px-2 pl-[8px]">
                      <span className="text-xs text-muted-foreground font-medium">Без группы</span>
                    </div>
                  </div>
                )}
                {page.ungroupedReplies.map((reply, i) => (
                  <DraggableReplyRow
                    key={reply.id}
                    reply={reply}
                    depth={0}
                    page={page}
                    isLast={i === page.ungroupedReplies.length - 1}
                    dropIndicator={
                      dnd.dropIndicator?.replyId === reply.id ? dnd.dropIndicator.position : null
                    }
                  />
                ))}
              </UngroupedDropZone>
            )}
          </div>

          {/* Drag overlay */}
          <DragOverlay dropAnimation={null}>
            {dnd.activeReply && (
              <div className="flex items-center gap-1.5 h-7 px-3 bg-background border rounded-md shadow-md text-sm">
                <FileText className="w-3.5 h-3.5 text-blue-500" />
                <span className="truncate">{dnd.activeReply.name}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Counter */}
      {!isLoading && page.replies.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {page.filteredReplies.length} из {page.replies.length} шаблонов
          {page.groups.length > 0 && ` • ${page.groups.length} групп`}
        </div>
      )}
    </div>
  )
}
