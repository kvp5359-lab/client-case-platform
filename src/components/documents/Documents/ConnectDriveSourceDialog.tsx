"use client"

/**
 * Диалог «Подключить папку Google Drive как источник» — привязывает
 * существующий набор к произвольной папке Drive по ссылке, чтобы получать
 * из неё документы («лоток» + «Обновить файлы из источника»).
 */

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { isValidGoogleDriveUrl } from '@/utils/googleDrive'
import { connectDriveSourceToKit } from '@/services/api/documents/documentKit/documentKitDrive'
import { documentKitKeys, googleDriveKeys } from '@/hooks/queryKeys'
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
import { GoogleDriveIcon } from '@/components/shared/GoogleDriveIcon'

export type ConnectDriveSourceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kitId: string
  projectId: string
  workspaceId: string
  /** Название набора — для заголовка диалога. */
  kitName: string
  /** Открыть мастер «Создать папки на Google Drive» (альтернативный путь). */
  onCreateDriveFolders?: () => void
}

export function ConnectDriveSourceDialog({
  open,
  onOpenChange,
  kitId,
  projectId,
  workspaceId,
  kitName,
  onCreateDriveFolders,
}: ConnectDriveSourceDialogProps) {
  const queryClient = useQueryClient()
  const [link, setLink] = useState('')

  const linkTrimmed = link.trim()
  const linkValid = isValidGoogleDriveUrl(linkTrimmed)

  const connectMutation = useMutation({
    mutationFn: () =>
      connectDriveSourceToKit({ link: linkTrimmed, kitId, projectId, workspaceId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentKitKeys.byProject(projectId) }),
        queryClient.invalidateQueries({ queryKey: googleDriveKeys.kitSourceDocuments(kitId) }),
        queryClient.invalidateQueries({ queryKey: googleDriveKeys.sourceDocuments(projectId) }),
        queryClient.invalidateQueries({ queryKey: googleDriveKeys.documentSources(projectId) }),
      ])
      toast.success('Папка Google Drive подключена как источник')
      setLink('')
      onOpenChange(false)
    },
    onError: (error) => {
      logger.error('Failed to connect Drive source to kit', error)
      toast.error(error instanceof Error ? error.message : 'Не удалось подключить папку')
    },
  })

  const handleConnect = () => {
    if (!linkValid || connectMutation.isPending) return
    connectMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GoogleDriveIcon className="h-5 w-5 shrink-0" />
            Подключить папку Google Drive
          </DialogTitle>
          <DialogDescription>
            Набор «{kitName}». Файлы из папки появятся в наборе как источник — их можно
            обновлять и раскладывать по слотам.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="drive-source-link">Ссылка на папку Google Drive</Label>
          <Input
            id="drive-source-link"
            placeholder="https://drive.google.com/drive/folders/…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConnect()
            }}
            autoFocus
          />
          {linkTrimmed !== '' && !linkValid && (
            <p className="text-xs text-destructive">
              Не похоже на ссылку на папку Google Drive
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            У вашего Google-аккаунта должен быть доступ к этой папке. Подпапки первого
            уровня сопоставятся с одноимёнными папками набора.
          </p>
        </div>
        <DialogFooter className="sm:justify-between gap-2">
          {onCreateDriveFolders ? (
            <Button
              variant="ghost"
              className="sm:mr-auto"
              disabled={connectMutation.isPending}
              onClick={() => {
                onOpenChange(false)
                onCreateDriveFolders()
              }}
            >
              Создать папки на Drive
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={connectMutation.isPending}
            >
              Отмена
            </Button>
            <Button onClick={handleConnect} disabled={!linkValid || connectMutation.isPending}>
              {connectMutation.isPending ? 'Подключаю…' : 'Подключить'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
