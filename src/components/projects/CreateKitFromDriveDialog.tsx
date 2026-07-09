"use client"

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateDocumentKitFromDriveMutation } from '@/hooks/documents/useDocumentKitsQuery'
import { isValidGoogleDriveUrl } from '@/utils/googleDrive'
import { DocumentKitError } from '@/services/errors'
import { logger } from '@/utils/logger'

type CreateKitFromDriveDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  workspaceId: string
  onKitCreated?: (kitId: string) => void
}

export function CreateKitFromDriveDialog({
  open,
  onOpenChange,
  projectId,
  workspaceId,
  onKitCreated,
}: CreateKitFromDriveDialogProps) {
  const [link, setLink] = useState('')
  const createMutation = useCreateDocumentKitFromDriveMutation()
  const isCreating = createMutation.isPending

  const handleClose = () => {
    if (isCreating) return
    onOpenChange(false)
    setLink('')
  }

  const handleCreate = async () => {
    if (!isValidGoogleDriveUrl(link)) {
      toast.error('Вставьте корректную ссылку на папку Google Drive')
      return
    }

    try {
      const kitId = await createMutation.mutateAsync({ link, projectId, workspaceId })
      toast.success('Набор создан из папки Google Drive')
      onOpenChange(false)
      setLink('')
      onKitCreated?.(kitId)
    } catch (error) {
      logger.error('Ошибка создания набора из Google Drive:', error)
      toast.error(
        error instanceof DocumentKitError
          ? error.message
          : 'Не удалось создать набор из папки Google Drive',
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Создать набор из папки Google Drive</DialogTitle>
          <DialogDescription>
            Вставьте ссылку на папку. Набор будет назван по имени папки, а подпапки
            первого уровня станут папками набора. Файлы клиента подтянутся внутрь набора —
            их можно будет разложить по папкам вручную.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="drive-folder-link">Ссылка на папку Google Drive</Label>
          <Input
            id="drive-folder-link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isCreating) {
                e.preventDefault()
                handleCreate()
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            Нужен доступ к папке у подключённого Google Drive. Подключение — в настройках.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Отмена
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !link.trim()}>
            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Создать набор
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
