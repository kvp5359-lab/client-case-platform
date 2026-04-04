/**
 * Диалог редактирования быстрого ответа (название + текст с Tiptap)
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
import { TiptapEditor } from '@/components/tiptap-editor/tiptap-editor'
import type { QuickReply } from '@/hooks/useQuickReplies'

interface QuickReplyFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingReply: QuickReply | null
  onSave: (data: { name: string; content: string }) => void
  saving: boolean
}

export function QuickReplyFormDialog({
  open,
  onOpenChange,
  editingReply,
  onSave,
  saving,
}: QuickReplyFormDialogProps) {
  const [name, setName] = useState(editingReply?.name ?? '')
  const [content, setContent] = useState(editingReply?.content ?? '')

  const handleSave = () => {
    if (!name.trim()) return
    onSave({ name: name.trim(), content })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingReply ? 'Редактировать шаблон' : 'Новый шаблон'}</DialogTitle>
          <DialogDescription>
            {editingReply
              ? 'Измените название и текст шаблона быстрого ответа'
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
