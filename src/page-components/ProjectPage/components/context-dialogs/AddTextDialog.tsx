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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EditorDialogContent } from '@/components/ui/editor-dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const createText = useCreateContextText()

  const isDirty = name.trim() !== '' || text.trim() !== ''

  const close = () => {
    setName('')
    setText('')
    setConfirmOpen(false)
    onOpenChange(false)
  }

  // Закрытие с подтверждением, если что-то уже введено
  const requestClose = () => {
    if (isDirty) {
      setConfirmOpen(true)
      return
    }
    close()
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
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : requestClose())}>
      <EditorDialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2 pr-8">
            <div>
              <DialogTitle>Новая заметка</DialogTitle>
              <DialogDescription>
                Внутренний контекст проекта. Используется ассистентом, не виден клиентам.
              </DialogDescription>
            </div>
            <Button size="sm" onClick={handleSave} disabled={createText.isPending}>
              {createText.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Сохранить
            </Button>
          </div>
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
              className="max-h-[calc(100vh-280px)]"
              placeholder="Текст заметки. Доступно форматирование, списки, заголовки, картинки..."
              minHeight="280px"
              imageUpload={{ workspaceId, articleId: `new-${projectId}` }}
            />
          </div>
        </div>
      </EditorDialogContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Закрыть без сохранения?</AlertDialogTitle>
            <AlertDialogDescription>
              В заметке есть несохранённые изменения. Если закрыть сейчас, они будут потеряны.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Продолжить редактирование</AlertDialogCancel>
            <AlertDialogAction onClick={close}>Закрыть без сохранения</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
