'use client'

/**
 * Вкладка «Контекст проекта» — внутренние материалы команды.
 *
 * Тип записи: текст / файл / скриншот (paste из буфера).
 * Доступ — только командные роли (RLS отсекает клиентов на уровне БД).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Lock, Paperclip, Plus } from 'lucide-react'
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
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  const { data: participants = [] } = useWorkspaceParticipants(workspaceId)

  // user_id → отображаемое имя автора заметки
  const authorById = new Map(
    participants
      .filter((p) => p.user_id)
      .map((p) => [
        p.user_id as string,
        [p.name, p.last_name].filter(Boolean).join(' '),
      ]),
  )

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
    <div ref={rootRef} className="group border-t pt-4 space-y-3 max-w-[789px]">
      <div className="flex items-center gap-1.5 flex-wrap text-sm font-medium">
        <Lock className="h-4 w-4 text-muted-foreground" />
        <span>Заметки</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 ml-1 text-muted-foreground hover:text-foreground md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 transition-opacity"
              title="Добавить"
              aria-label="Добавить"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setTextDialogOpen(true)}>
              <FileText className="h-4 w-4 mr-2" /> Заметка
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFileDialogOpen(true)}>
              <Paperclip className="h-4 w-4 mr-2" /> Файл
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Пока нет записей. Добавьте заметку, файл или вставьте скриншот{' '}
          <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px]">Ctrl/⌘+V</kbd>.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {items.map((item) => (
            <ProjectContextItemCard
              key={item.id}
              item={item}
              projectId={projectId}
              workspaceId={workspaceId}
              onDelete={() => setConfirmDeleteId(item.id)}
              compact
              authorName={item.created_by ? authorById.get(item.created_by) : undefined}
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



