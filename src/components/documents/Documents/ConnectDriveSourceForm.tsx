"use client"

/**
 * Форма «Подключить папку Google Drive как источник» — привязывает
 * существующий набор к произвольной папке Drive по ссылке, чтобы получать
 * из неё документы («лоток» + «Обновить файлы из источника»).
 * Рендерится вкладкой внутри CreateDriveFoldersDialog (без Dialog-обёртки).
 */

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { isValidGoogleDriveUrl } from '@/utils/googleDrive'
import { connectDriveSourceToKit } from '@/services/api/documents/documentKit/documentKitDrive'
import { documentKitKeys, googleDriveKeys } from '@/hooks/queryKeys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DialogFooter } from '@/components/ui/dialog'

export type ConnectDriveSourceFormProps = {
  kitId: string
  projectId: string
  workspaceId: string
  /** Закрыть диалог (после успеха или по «Отмена»). */
  onClose: () => void
}

export function ConnectDriveSourceForm({
  kitId,
  projectId,
  workspaceId,
  onClose,
}: ConnectDriveSourceFormProps) {
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
      onClose()
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
    <div className="space-y-4">
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
          Файлы из папки появятся в наборе как источник — их можно обновлять и
          раскладывать по слотам. У вашего Google-аккаунта должен быть доступ к папке.
          Подпапки первого уровня сопоставятся с одноимёнными папками набора.
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={connectMutation.isPending}>
          Отмена
        </Button>
        <Button onClick={handleConnect} disabled={!linkValid || connectMutation.isPending}>
          {connectMutation.isPending ? 'Подключаю…' : 'Подключить'}
        </Button>
      </DialogFooter>
    </div>
  )
}
