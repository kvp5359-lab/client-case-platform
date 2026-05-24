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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TiptapEditor } from '@/components/tiptap-editor/tiptap-editor'
import { useRenameContextItem, useUpdateContextText } from '@/hooks/projects/useProjectContext'
import type { ProjectContextItemWithFile } from '@/services/api/projectContext/projectContextService'

interface Props {
  item: ProjectContextItemWithFile
  projectId: string
  workspaceId: string
  onClose: () => void
}

export function ContextTextDialog({ item, projectId, workspaceId, onClose }: Props) {
  const [name, setName] = useState(item.name)
  const [content, setContent] = useState(item.content_html ?? '')
  const renameMutation = useRenameContextItem(projectId)
  const updateMutation = useUpdateContextText(projectId)

  const isDirty =
    name.trim() !== item.name || content !== (item.content_html ?? '')

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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="sr-only">Заметка контекста проекта</DialogTitle>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-lg font-semibold border-0 px-0 h-9 focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder="Название записи"
          />
        </DialogHeader>
        <div className="border rounded-md">
          <TiptapEditor
            content={content}
            onChange={setContent}
            placeholder="Текст заметки. Доступно форматирование, списки, заголовки, картинки..."
            minHeight="320px"
            imageUpload={{ workspaceId, articleId: item.id }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {isDirty ? 'Отмена' : 'Закрыть'}
          </Button>
          {isDirty && (
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Сохранить
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
