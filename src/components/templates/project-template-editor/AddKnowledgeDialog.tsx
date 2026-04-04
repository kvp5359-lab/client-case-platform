/**
 * Диалог добавления статей/групп базы знаний в шаблон проекта.
 * Рекурсивное дерево: группы (с вложенными подгруппами) + статьи внутри каждой группы.
 */

import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GroupTreeNode } from './GroupTreeNode'
import { useKnowledgeTreeData } from './useKnowledgeTreeData'

interface AddKnowledgeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | undefined
  linkedGroupIds: string[]
  linkedArticleIds: string[]
  onAdd: (groupIds: string[], articleIds: string[]) => void
  onCancel: () => void
  isPending: boolean
}

export function AddKnowledgeDialog({
  open,
  onOpenChange,
  workspaceId,
  linkedGroupIds,
  linkedArticleIds,
  onAdd,
  onCancel,
  isPending,
}: AddKnowledgeDialogProps) {
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set())
  const [selectedArticleIds, setSelectedArticleIds] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const { data: treeData } = useKnowledgeTreeData(workspaceId, open)

  const { roots = [], ungroupedArticles = [] } = treeData || {}

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setSelectedGroupIds(new Set())
      setSelectedArticleIds(new Set())
      setExpandedGroups(new Set())
    }
    onOpenChange(v)
  }

  const toggleExpand = useCallback((id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectGroup = useCallback((id: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectArticle = useCallback((id: string) => {
    setSelectedArticleIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const totalSelected = selectedGroupIds.size + selectedArticleIds.size

  const handleAdd = () => {
    onAdd([...selectedGroupIds], [...selectedArticleIds])
    setSelectedGroupIds(new Set())
    setSelectedArticleIds(new Set())
    setExpandedGroups(new Set())
  }

  const isEmpty = roots.length === 0 && ungroupedArticles.length === 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Добавить материалы базы знаний</DialogTitle>
          <DialogDescription>Выберите группы целиком или отдельные статьи</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
          {isEmpty ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              Нет доступных материалов для добавления
            </p>
          ) : (
            <div>
              {roots.map((node, idx) => (
                <GroupTreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  isLast={idx === roots.length - 1 && ungroupedArticles.length === 0}
                  expandedGroups={expandedGroups}
                  selectedGroupIds={selectedGroupIds}
                  selectedArticleIds={selectedArticleIds}
                  linkedGroupIds={linkedGroupIds}
                  linkedArticleIds={linkedArticleIds}
                  onToggleExpand={toggleExpand}
                  onToggleSelectGroup={toggleSelectGroup}
                  onToggleSelectArticle={toggleSelectArticle}
                  parentGroupSelected={false}
                />
              ))}

              {ungroupedArticles.length > 0 && (
                <>
                  {roots.length > 0 && (
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider pt-3 pb-1 px-1">
                      Без группы
                    </div>
                  )}
                  {ungroupedArticles.map((article) => {
                    const isLinked = linkedArticleIds.includes(article.id)
                    const isSelected = selectedArticleIds.has(article.id)

                    return (
                      <label
                        key={article.id}
                        className={cn(
                          'flex items-center gap-1.5 h-6 px-1 ml-6 rounded hover:bg-muted/30 cursor-pointer',
                          isSelected && 'bg-amber-50/50',
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectArticle(article.id)}
                          disabled={isLinked}
                          className="shrink-0 h-3 w-3"
                        />
                        <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span
                          className={cn(
                            'text-[11px] truncate',
                            isLinked && 'text-muted-foreground',
                          )}
                        >
                          {article.title}
                        </span>
                        {isLinked && (
                          <span className="text-[10px] text-muted-foreground/60 shrink-0 italic">
                            добавлена
                          </span>
                        )}
                      </label>
                    )
                  })}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} size="sm">
            Отмена
          </Button>
          <Button onClick={handleAdd} disabled={totalSelected === 0 || isPending} size="sm">
            {isPending ? 'Добавление...' : `Добавить (${totalSelected})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
