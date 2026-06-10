'use client'

/**
 * Модал для просмотра и редактирования текстовой записи «Контекста проекта».
 * Использует полноценный TiptapEditor (тот же, что и для статей знаний).
 */

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { TiptapEditor } from '@/components/tiptap-editor/tiptap-editor'
import { useRenameContextItem, useUpdateContextText } from '@/hooks/projects/useProjectContext'
import type { ProjectContextItemWithFile } from '@/services/api/projectContext/projectContextService'

type Props = {
  item: ProjectContextItemWithFile
  projectId: string
  workspaceId: string
  onClose: () => void
}

export function ContextTextDialog({ item, projectId, workspaceId, onClose }: Props) {
  const [name, setName] = useState(item.name)
  const [content, setContent] = useState(item.content_html ?? '')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const renameMutation = useRenameContextItem(projectId)
  const updateMutation = useUpdateContextText(projectId)

  const isDirty =
    name.trim() !== item.name || content !== (item.content_html ?? '')

  // Закрытие с подтверждением, если есть несохранённые изменения
  const requestClose = () => {
    if (isDirty) {
      setConfirmOpen(true)
      return
    }
    onClose()
  }

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('Укажите название')
      return
    }
    try {
      const tasks: Promise<void>[] = []
      if (trimmedName !== item.name) {
        tasks.push(renameMutation.mutateAsync({ id: item.id, name: trimmedName }))
      }
      if (content !== (item.content_html ?? '')) {
        tasks.push(updateMutation.mutateAsync({ id: item.id, contentHtml: content }))
      }
      await Promise.all(tasks)
      toast.success('Сохранено')
      onClose()
    } catch (err) {
      toast.error('Не удалось сохранить', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const isSaving = renameMutation.isPending || updateMutation.isPending

  return (
    <Dialog open onOpenChange={(o) => !o && requestClose()}>
      <DialogContent
        className="max-w-3xl"
        onInteractOutside={(e) => {
          // Не закрываем по клику вне, если есть несохранённые изменения —
          // сначала спросим подтверждение
          if (isDirty) {
            e.preventDefault()
            setConfirmOpen(true)
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="sr-only">Заметка контекста проекта</DialogTitle>
          <div className="flex items-center gap-2 pr-8">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 text-lg font-semibold h-9 px-3"
              placeholder="Название записи"
            />
            {isDirty && (
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Сохранить
              </Button>
            )}
          </div>
        </DialogHeader>
        <div className="border rounded-md">
          <TiptapEditor
            content={content}
            onChange={setContent}
            className="max-h-[calc(100vh-220px)]"
            placeholder="Текст заметки. Доступно форматирование, списки, заголовки, картинки..."
            minHeight="320px"
            imageUpload={{ workspaceId, articleId: item.id }}
          />
        </div>
      </DialogContent>

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
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false)
                onClose()
              }}
            >
              Закрыть без сохранения
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
