"use client"

/**
 * Диалог создания текстовой заметки в «Контекст проекта».
 * Использует TiptapEditor для форматирования.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TiptapEditor } from '@/components/tiptap-editor/tiptap-editor'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCreateContextText } from '@/hooks/projects/useProjectContext'

export function AddTextDialog({
  open,
  onOpenChange,
  projectId,
  workspaceId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  workspaceId: string
}) {
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const createText = useCreateContextText()

  const close = () => {
    setName('')
    setText('')
    onOpenChange(false)
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Укажите название')
      return
    }
    try {
      await createText.mutateAsync({
        workspaceId,
        projectId,
        name: name.trim(),
        contentHtml: text,
      })
      toast.success('Заметка сохранена')
      close()
    } catch (err) {
      toast.error('Не удалось сохранить', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Новая заметка</DialogTitle>
          <DialogDescription>
            Внутренний контекст проекта. Используется ассистентом, не виден клиентам.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Название (например, «Расшифровка звонка с клиентом 14.05»)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div className="border rounded-md">
            <TiptapEditor
              content={text}
              onChange={setText}
              placeholder="Текст заметки. Доступно форматирование, списки, заголовки, картинки..."
              minHeight="280px"
              imageUpload={{ workspaceId, articleId: `new-${projectId}` }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={createText.isPending}>
            {createText.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
