import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ColorPickerInline } from './ColorPickerInline'
import { hashString, TAG_COLOR_PALETTE } from '@/utils/notionPill'
import { ArticleTreePicker } from '@/components/templates/ArticleTreePicker'
import type { KnowledgeGroup, useKnowledgeBasePage } from '../useKnowledgeBasePage'

type PageReturn = ReturnType<typeof useKnowledgeBasePage>

export function EditGroupDialog({
  group,
  open,
  onOpenChange,
  page,
}: {
  group: KnowledgeGroup | null
  open: boolean
  onOpenChange: (open: boolean) => void
  page: PageReturn
}) {
  const [name, setName] = useState(() => group?.name ?? '')
  const [color, setColor] = useState(
    () =>
      group?.color || TAG_COLOR_PALETTE[hashString(group?.name ?? '') % TAG_COLOR_PALETTE.length],
  )
  const [parentId, setParentId] = useState<string | null>(() => group?.parent_id || null)

  // Collect group + all descendants to exclude from parent picker
  const excludeGroupIds = useMemo(() => {
    if (!group) return new Set<string>()
    const ids = new Set<string>()
    const collectDescendants = (id: string) => {
      for (const g of page.groups) {
        if (g.parent_id === id) {
          ids.add(g.id)
          collectDescendants(g.id)
        }
      }
    }
    ids.add(group.id)
    collectDescendants(group.id)
    return ids
  }, [group, page.groups])

  const handleSave = () => {
    if (!group || !name.trim()) return
    page.updateGroupMutation.mutate(
      {
        id: group.id,
        name: name.trim(),
        color,
        parentId: parentId,
      },
      {
        onSuccess: () => onOpenChange(false),
      },
    )
  }

  if (!group) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Редактирование группы</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Название</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
              }}
              autoFocus
            />
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label>Цвет</Label>
            <ColorPickerInline color={color} onChange={setColor} />
          </div>

          {/* Parent group */}
          <div className="space-y-1.5">
            <Label>Группа-родитель</Label>
            <ArticleTreePicker
              mode="single-group"
              groups={page.groups}
              selectedId={parentId}
              onSelect={setParentId}
              excludeGroupIds={excludeGroupIds}
              emptyLabel="Без родителя (корневая)"
              searchPlaceholder="Поиск группы..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || page.updateGroupMutation.isPending}
          >
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
