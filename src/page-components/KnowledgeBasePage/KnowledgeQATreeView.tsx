/**
 * Вид «Дерево» для Q&A — на том же общем стеке, что и статьи (GroupTreeBody +
 * TreeSource). Группы и их CRUD переиспользуются из useKnowledgeGroups,
 * редактор группы — общий EditGroupDialog.
 */

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FolderPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { knowledgeBaseKeys } from '@/hooks/queryKeys'
import { GroupTreeBody } from '@/components/knowledge/tree/GroupTreeBody'
import type { TreeSource } from '@/components/knowledge/tree/types'
import type { KnowledgeQA } from '@/services/api/knowledge/knowledgeSearchService'
import { useKnowledgeGroups } from './useKnowledgeGroups'
import type { KnowledgeGroup } from './useKnowledgeBasePage'
import { EditGroupDialog } from './components/EditGroupDialog'
import { SortableQARow, QARow } from './components/QARows'

export function KnowledgeQATreeView({
  workspaceId,
  items,
  isSearchActive,
  onRowClick,
  onDelete,
  onAddQA,
}: {
  workspaceId: string
  items: KnowledgeQA[]
  isSearchActive: boolean
  onRowClick: (qa: KnowledgeQA) => void
  onDelete: (qa: KnowledgeQA) => void
  onAddQA: () => void
}) {
  const queryClient = useQueryClient()
  const groupsHook = useKnowledgeGroups(workspaceId, 'qa')
  const [editingGroup, setEditingGroup] = useState<KnowledgeGroup | null>(null)

  const invalidateQA = () =>
    queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.qa(workspaceId) })

  const moveMutation = useMutation({
    mutationFn: async ({
      itemId,
      fromGroupId,
      toGroupId,
    }: {
      itemId: string
      fromGroupId: string | null
      toGroupId: string | null
    }) => {
      const { error } = await supabase.rpc('move_qa_to_group', {
        p_qa_id: itemId,
        p_from_group_id: fromGroupId ?? undefined,
        p_to_group_id: toGroupId ?? undefined,
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidateQA()
      toast.success('Q&A перемещён')
    },
    onError: () => toast.error('Не удалось переместить Q&A'),
  })

  const reorderMutation = useMutation({
    mutationFn: async ({ groupId, itemIds }: { groupId: string; itemIds: string[] }) => {
      const updates = itemIds.map((qaId, index) =>
        supabase
          .from('knowledge_qa_groups')
          .update({ sort_order: index })
          .eq('qa_id', qaId)
          .eq('group_id', groupId),
      )
      const results = await Promise.all(updates)
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onSuccess: invalidateQA,
    onError: () => toast.error('Не удалось сохранить порядок'),
  })

  const getItemsForGroup = (groupId: string) =>
    items
      .filter((qa) => qa.knowledge_qa_groups?.some((g) => g.group_id === groupId))
      .sort((a, b) => {
        const sa = a.knowledge_qa_groups?.find((g) => g.group_id === groupId)?.sort_order ?? 9999
        const sb = b.knowledge_qa_groups?.find((g) => g.group_id === groupId)?.sort_order ?? 9999
        return sa - sb
      })

  const ungroupedItems = items.filter(
    (qa) => !qa.knowledge_qa_groups || qa.knowledge_qa_groups.length === 0,
  )

  function groupHasMatches(groupId: string): boolean {
    if (getItemsForGroup(groupId).length > 0) return true
    return groupsHook.groups
      .filter((g) => g.parent_id === groupId)
      .some((c) => groupHasMatches(c.id))
  }

  const handleDeleteGroup = (g: { id: string; name: string }) => {
    if (!window.confirm(`Удалить группу «${g.name}»? Q&A из неё не удалятся, только связь.`)) return
    groupsHook.deleteGroupMutation.mutate(g.id, { onSuccess: invalidateQA })
  }

  const source: TreeSource<KnowledgeQA> = {
    workspaceId,
    groups: groupsHook.groups as KnowledgeGroup[],
    items,
    getItemGroupId: (id) => {
      const qa = items.find((x) => x.id === id)
      return qa && qa.knowledge_qa_groups && qa.knowledge_qa_groups.length > 0
        ? qa.knowledge_qa_groups[0].group_id
        : null
    },
    getItemsForGroup,
    ungroupedItems,
    moveItemToGroup: (args, opts) => moveMutation.mutate(args, opts),
    reorderItems: ({ groupId, itemIds }) => reorderMutation.mutate({ groupId, itemIds }),
    addingGroupParentId: groupsHook.addingGroupParentId,
    setAddingGroupParentId: groupsHook.setAddingGroupParentId,
    newGroupName: groupsHook.newGroupName,
    setNewGroupName: groupsHook.setNewGroupName,
    onCreateGroup: groupsHook.handleCreateGroup,
    createGroupPending: groupsHook.createGroupMutation.isPending,
    onEditGroup: (g) => setEditingGroup(g as KnowledgeGroup),
    onDeleteGroup: handleDeleteGroup,
    onAddItem: () => onAddQA(),
    addItemTitle: 'Добавить Q&A',
    renderItemRow: ({ item, depth, isLast, dropPosition }) =>
      depth === 0 ? (
        <QARow
          key={item.id}
          qa={item}
          depth={0}
          workspaceId={workspaceId}
          onRowClick={onRowClick}
          onDelete={onDelete}
        />
      ) : (
        <SortableQARow
          key={item.id}
          qa={item}
          depth={depth}
          isLast={isLast}
          dropIndicator={dropPosition}
          workspaceId={workspaceId}
          onRowClick={onRowClick}
          onDelete={onDelete}
        />
      ),
    renderDragOverlay: (item) => (
      <div className="flex items-center gap-1.5 h-7 px-3 bg-background border rounded-md shadow-md text-sm max-w-md">
        <span className="truncate">{item.question}</span>
      </div>
    ),
    filterChildren: isSearchActive ? groupHasMatches : undefined,
    isSearchActive,
  }

  return (
    <>
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-muted-foreground"
          onClick={() => {
            groupsHook.setNewGroupName('')
            groupsHook.setAddingGroupParentId('root')
          }}
        >
          <FolderPlus className="w-3.5 h-3.5" />
          Добавить группу
        </Button>
      </div>
      {groupsHook.groups.length === 0 && groupsHook.addingGroupParentId !== 'root' ? (
        <div className="border rounded-lg py-8 text-center text-sm text-muted-foreground">
          Нет групп. Нажмите «Добавить группу» или создайте Q&A с группой в редакторе.
        </div>
      ) : (
        <GroupTreeBody source={source} />
      )}
      <EditGroupDialog
        key={editingGroup?.id}
        group={editingGroup}
        open={!!editingGroup}
        onOpenChange={(open) => !open && setEditingGroup(null)}
        groups={groupsHook.groups as KnowledgeGroup[]}
        updateGroup={groupsHook.updateGroupMutation.mutate}
        isSaving={groupsHook.updateGroupMutation.isPending}
      />
    </>
  )
}
