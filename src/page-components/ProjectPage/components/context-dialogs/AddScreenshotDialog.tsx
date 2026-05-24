"use client"

/**
 * Диалог сохранения скриншота из буфера обмена (paste).
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCreateContextFile } from '@/hooks/projects/useProjectContext'

export function AddScreenshotDialog({
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
