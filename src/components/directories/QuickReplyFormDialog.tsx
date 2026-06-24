/**
 * Диалог создания/редактирования быстрого ответа (название + текст с Tiptap + группа)
 */

import { lazy, Suspense, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EditorDialogContent } from '@/components/ui/editor-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
// Lazy: TiptapEditor подтягивает все extensions (~8 МБ). Диалог открывается редко.
const TiptapEditor = lazy(() =>
  import('@/components/tiptap-editor/tiptap-editor').then((m) => ({ default: m.TiptapEditor })),
)
import type { QuickReply } from '@/hooks/quick-replies/useQuickReplies'
import type { QuickReplyGroup } from '@/hooks/quick-replies/useQuickReplyGroups'

const NO_GROUP_VALUE = '__none__'

type QuickReplyFormDialogProps = {
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
      <EditorDialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto p-0">
        {/* Sticky-шапка: название (слева) + «Сохранить» (справа). Прилипает
            при прокрутке тела диалога, как в основном диалоге заметки. */}
        <div className="sticky top-0 z-10 bg-background border-b px-6 py-4">
          <DialogHeader className="space-y-0">
            <DialogTitle className="sr-only">
              {editingReply ? 'Редактировать шаблон' : 'Новый шаблон'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {editingReply
                ? 'Измените название, группу и текст шаблона быстрого ответа'
                : 'Создайте новый шаблон быстрого ответа'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input
              id="qr-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название шаблона"
              disabled={saving}
              autoFocus
              className="flex-1 text-base font-semibold h-9"
            />
            <Button onClick={handleSave} disabled={saving || !name.trim()} className="shrink-0">
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Сохранить
            </Button>
          </div>
        </div>

        <div className="space-y-4 px-6 pb-6 pt-4">
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
              <Suspense fallback={<div className="h-[150px] flex items-center justify-center text-sm text-muted-foreground">Загружаю редактор…</div>}>
                <TiptapEditor
                  content={content}
                  onChange={setContent}
                  placeholder="Введите текст шаблона..."
                  minHeight="150px"
                  showMenuBar
                />
              </Suspense>
            </div>
          </div>
        </div>
      </EditorDialogContent>
    </Dialog>
  )
}
