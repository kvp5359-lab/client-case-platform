'use client'

/**
 * Вкладка «Контекст проекта» — внутренние материалы команды.
 *
 * Тип записи: текст / файл / скриншот (paste из буфера).
 * Доступ — только командные роли (RLS отсекает клиентов на уровне БД).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Image as ImageIcon, Lock, Paperclip } from 'lucide-react'
import { PageLoader } from '@/components/ui/loaders'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
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
import {
  useProjectContextItems,
  useDeleteContextItem,
} from '@/hooks/projects/useProjectContext'
import { ProjectContextItemCard } from './ProjectContextItemCard'
import { AddTextDialog } from './context-dialogs/AddTextDialog'
import { AddFileDialog } from './context-dialogs/AddFileDialog'
import { AddScreenshotDialog } from './context-dialogs/AddScreenshotDialog'

type ProjectContextTabContentProps = {
  projectId: string
  workspaceId: string
}

export function ProjectContextTabContent({
  projectId,
  workspaceId,
}: ProjectContextTabContentProps) {
  const { data: items = [], isLoading } = useProjectContextItems(projectId)
  const deleteItem = useDeleteContextItem(projectId, workspaceId)

  const [textDialogOpen, setTextDialogOpen] = useState(false)
  const [fileDialogOpen, setFileDialogOpen] = useState(false)
  const [screenshotDialog, setScreenshotDialog] = useState<{
    file: File
    previewUrl: string
  } | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)

  // Глобальный paste-handler для скриншотов из буфера
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // если фокус на input/textarea/редакторе — не перехватываем
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        if (target.isContentEditable) return
      }
      const files = Array.from(e.clipboardData?.files ?? [])
      const imageFile = files.find((f) => f.type.startsWith('image/'))
      if (!imageFile) return
      e.preventDefault()
      const previewUrl = URL.createObjectURL(imageFile)
      setScreenshotDialog({ file: imageFile, previewUrl })
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDeleteId) return
    try {
      await deleteItem.mutateAsync(confirmDeleteId)
      toast.success('Запись перемещена в корзину')
    } catch (err) {
      toast.error('Не удалось удалить', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setConfirmDeleteId(null)
    }
  }, [confirmDeleteId, deleteItem])

  return (
    <div ref={rootRef} className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          <span>Внутренние материалы команды. Клиенты не видят этот раздел.</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setTextDialogOpen(true)}>
            <FileText className="h-4 w-4 mr-1.5" /> Заметка
          </Button>
          <Button size="sm" variant="outline" onClick={() => setFileDialogOpen(true)}>
            <Paperclip className="h-4 w-4 mr-1.5" /> Файл
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px]">Ctrl/⌘+V</kbd>{' '}
        — вставить скриншот из буфера обмена.
      </p>

      {isLoading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
          <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Пока нет записей. Добавьте заметку, файл или вставьте скриншот.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ProjectContextItemCard
              key={item.id}
              item={item}
              projectId={projectId}
              workspaceId={workspaceId}
              onDelete={() => setConfirmDeleteId(item.id)}
            />
          ))}
        </div>
      )}

      <AddTextDialog
        open={textDialogOpen}
        onOpenChange={setTextDialogOpen}
        projectId={projectId}
        workspaceId={workspaceId}
      />

      <AddFileDialog
        open={fileDialogOpen}
        onOpenChange={setFileDialogOpen}
        projectId={projectId}
        workspaceId={workspaceId}
      />

      {screenshotDialog && (
        <AddScreenshotDialog
          key={screenshotDialog.previewUrl}
          screenshot={screenshotDialog}
          onClose={() => {
            URL.revokeObjectURL(screenshotDialog.previewUrl)
            setScreenshotDialog(null)
          }}
          projectId={projectId}
          workspaceId={workspaceId}
        />
      )}

      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить запись?</AlertDialogTitle>
            <AlertDialogDescription>
              Запись будет перемещена в корзину. Восстановить можно в настройках воркспейса.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}



