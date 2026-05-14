'use client'

/**
 * Вкладка «Контекст проекта» — внутренние материалы команды.
 *
 * Тип записи: текст / файл / скриншот (paste из буфера).
 * Доступ — только командные роли (RLS отсекает клиентов на уровне БД).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Image as ImageIcon, Loader2, Lock, Paperclip } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  useProjectContextItems,
  useCreateContextText,
  useCreateContextFile,
  useDeleteContextItem,
} from '@/hooks/useProjectContext'
import { ProjectContextItemCard } from './ProjectContextItemCard'

interface ProjectContextTabContentProps {
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
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
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

// ─── Диалог: новая текстовая заметка ─────────────────────────────────────────

function AddTextDialog({
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
      <DialogContent className="max-w-2xl">
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
          <Textarea
            placeholder="Текст заметки..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            className="resize-y"
          />
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

// ─── Диалог: загрузка файла ──────────────────────────────────────────────────

function AddFileDialog({
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
  const [file, setFile] = useState<File | null>(null)
  const createFile = useCreateContextFile()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const close = () => {
    setName('')
    setFile(null)
    onOpenChange(false)
  }

  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null
    if (picked) {
      setFile(picked)
      if (!name) setName(picked.name)
    }
  }

  const handleSave = async () => {
    if (!file) {
      toast.error('Выберите файл')
      return
    }
    if (!name.trim()) {
      toast.error('Укажите название')
      return
    }
    try {
      await createFile.mutateAsync({
        workspaceId,
        projectId,
        name: name.trim(),
        file,
        itemType: 'file',
      })
      toast.success('Файл загружен')
      close()
    } catch (err) {
      toast.error('Не удалось загрузить', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Загрузить файл</DialogTitle>
          <DialogDescription>
            Любой файл: документ, аудио, видео, изображение.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handlePickFile}
          />
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4 mr-2" />
            {file ? `${file.name} (${formatBytes(file.size)})` : 'Выбрать файл...'}
          </Button>
          <Input
            placeholder="Название записи"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={createFile.isPending || !file}>
            {createFile.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Диалог: скриншот из буфера ─────────────────────────────────────────────

function AddScreenshotDialog({
  screenshot,
  onClose,
  projectId,
  workspaceId,
}: {
  screenshot: { file: File; previewUrl: string }
  onClose: () => void
  projectId: string
  workspaceId: string
}) {
  const [name, setName] = useState(() => {
    const now = new Date()
    const formatted = now.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    return `Скриншот ${formatted}`
  })
  const createFile = useCreateContextFile()

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Укажите название')
      return
    }
    try {
      const ext = screenshot.file.type.split('/')[1] || 'png'
      const renamedFile = new File([screenshot.file], `screenshot.${ext}`, {
        type: screenshot.file.type,
      })
      await createFile.mutateAsync({
        workspaceId,
        projectId,
        name: name.trim(),
        file: renamedFile,
        itemType: 'screenshot',
      })
      toast.success('Скриншот сохранён')
      onClose()
    } catch (err) {
      toast.error('Не удалось сохранить', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Сохранить скриншот</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md overflow-hidden border bg-muted/30 max-h-[280px] flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={screenshot.previewUrl}
              alt="preview"
              className="max-h-[280px] object-contain"
            />
          </div>
          <Input
            placeholder="Название"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={createFile.isPending}>
            {createFile.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

