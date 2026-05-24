"use client"

/**
 * Диалог загрузки файла в «Контекст проекта». Любой тип файла.
 */

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCreateContextFile } from '@/hooks/projects/useProjectContext'
import { formatBytes } from '@/utils/files/formatBytes'

export function AddFileDialog({
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
