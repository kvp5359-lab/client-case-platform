/**
 * QuickReplyTreeView — дерево групп и шаблонов быстрых ответов.
 * По паттерну KnowledgeTreeView.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, FolderPlus, Zap, Check, X } from 'lucide-react'
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { QuickReplyGroupTreeItem, ReplyRow } from './QuickReplyGroupTreeItem'
import type { useQuickRepliesPage } from '@/hooks/useQuickRepliesPage'

type PageReturn = ReturnType<typeof useQuickRepliesPage>

export function QuickReplyTreeView({ page }: { page: PageReturn }) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

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
              sensors={sensors}
            />
          ))}

          {/* Ungrouped replies */}
          {page.ungroupedReplies.length > 0 && rootGroups.length > 0 && (
            <div className="border-t mt-1 pt-1">
              <div className="flex items-center gap-1.5 h-6 px-2 pl-[8px]">
                <span className="text-xs text-muted-foreground font-medium">Без группы</span>
              </div>
            </div>
          )}
          {page.ungroupedReplies.map((reply) => (
            <ReplyRow key={reply.id} reply={reply} depth={0} page={page} />
          ))}
        </div>
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
