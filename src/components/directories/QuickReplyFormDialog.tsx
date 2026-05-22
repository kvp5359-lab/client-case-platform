/**
 * Диалог создания/редактирования быстрого ответа (название + текст с Tiptap + группа)
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TiptapEditor } from '@/components/tiptap-editor/tiptap-editor'
import type { QuickReply } from '@/hooks/useQuickReplies'
import type { QuickReplyGroup } from '@/hooks/useQuickReplyGroups'

const NO_GROUP_VALUE = '__none__'

interface QuickReplyFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingReply: QuickReply | null
  /** Если не передано — селектор группы скрыт (используется в picker'е) */
  groups?: QuickReplyGroup[]
  initialGroupId?: string | null
  onSave: (data: { name: string; content: string; groupId: string | null }) => void
  saving: boolean
}

/** Плоский список групп с отступом по глубине вложенности */
function flattenGroups(groups: QuickReplyGroup[]): Array<{ id: string; label: string }> {
  const byParent = new Map<string | null, QuickReplyGroup[]>()
  for (const g of groups) {
    const key = g.parent_id ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(g)
  }
  const result: Array<{ id: string; label: string }> = []
  const walk = (parentId: string | null, depth: number) => {
    const children = byParent.get(parentId) ?? []
    for (const g of children) {
      result.push({ id: g.id, label: `${'— '.repeat(depth)}${g.name}` })
      walk(g.id, depth + 1)
    }
  }
  walk(null, 0)
  return result
}

export function QuickReplyFormDialog({
  open,
  onOpenChange,
  editingReply,
  groups,
  initialGroupId,
  onSave,
  saving,
}: QuickReplyFormDialogProps) {
  const [name, setName] = useState(editingReply?.name ?? '')
  const [content, setContent] = useState(editingReply?.content ?? '')
  const [groupId, setGroupId] = useState<string | null>(
    editingReply?.group_id ?? initialGroupId ?? null,
  )

  const handleSave = () => {
    if (!name.trim()) return
    onSave({ name: name.trim(), content, groupId })
  }

  const showGroupSelect = Array.isArray(groups)
  const flatGroups = showGroupSelect ? flattenGroups(groups!) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingReply ? 'Редактировать шаблон' : 'Новый шаблон'}</DialogTitle>
          <DialogDescription>
            {editingReply
              ? 'Измените название, группу и текст шаблона быстрого ответа'
              : 'Создайте новый шаблон быстрого ответа'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="qr-name">Название *</Label>
            <Input
              id="qr-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Приветствие нового клиента"
              disabled={saving}
              autoFocus
            />
          </div>

          {showGroupSelect && (
            <div className="space-y-2">
              <Label htmlFor="qr-group">Группа</Label>
              <Select
                value={groupId ?? NO_GROUP_VALUE}
                onValueChange={(v) => setGroupId(v === NO_GROUP_VALUE ? null : v)}
                disabled={saving}
              >
                <SelectTrigger id="qr-group">
                  <SelectValue placeholder="Без группы" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GROUP_VALUE}>Без группы</SelectItem>
                  {flatGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Текст ответа</Label>
            <div className="border rounded-md">
              <TiptapEditor
                content={content}
                onChange={setContent}
                placeholder="Введите текст шаблона..."
                minHeight="150px"
                showMenuBar
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
