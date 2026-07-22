"use client"

/**
 * Диалог «Открыть доступ к папке Google Drive» — выдаёт права на папку
 * набора конкретному email через edge-функцию google-drive-share-folder.
 * Делиться может только пользователь, чей Google-аккаунт имеет право
 * шарить эту папку (обычно — владелец/создатель папки).
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GoogleDriveIcon } from '@/components/shared/GoogleDriveIcon'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ShareDriveFolderDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  driveFolderId: string
  /** Название набора/папки — для заголовка диалога. */
  folderName: string
}

export function ShareDriveFolderDialog({
  open,
  onOpenChange,
  workspaceId,
  driveFolderId,
  folderName,
}: ShareDriveFolderDialogProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'reader' | 'writer'>('reader')
  const [submitting, setSubmitting] = useState(false)

  const emailValid = EMAIL_RE.test(email.trim())

  const handleShare = async () => {
    if (!emailValid || submitting) return
    setSubmitting(true)
    try {
      const { data, error } = await supabase.functions.invoke('google-drive-share-folder', {
        body: {
          workspaceId,
          folderId: driveFolderId,
          email: email.trim(),
          role,
        },
      })
      if (error) throw error
      if (data?.error) {
        toast.error(humanizeShareError(data.error))
        return
      }
      toast.success(
        `Доступ ${role === 'reader' ? '«Читатель»' : '«Редактор»'} выдан: ${email.trim()}`,
      )
      setEmail('')
      onOpenChange(false)
    } catch (err) {
      logger.error('Failed to share Drive folder', err)
      toast.error('Не удалось выдать доступ к папке')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GoogleDriveIcon className="h-5 w-5 shrink-0" />
            Доступ к папке на Google Drive
          </DialogTitle>
          <DialogDescription>
            Папка «{folderName}». Пользователь получит письмо-приглашение от Google Drive.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="drive-share-email">Email (Google-аккаунт)</Label>
            <Input
              id="drive-share-email"
              type="email"
              placeholder="client@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleShare()
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Уровень доступа</Label>
            <Select value={role} onValueChange={(v) => setRole(v as 'reader' | 'writer')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reader">Читатель — только просмотр</SelectItem>
                <SelectItem value="writer">Редактор — просмотр и изменение</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Отмена
          </Button>
          <Button onClick={handleShare} disabled={!emailValid || submitting}>
            {submitting ? 'Выдаю доступ…' : 'Выдать доступ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Переводит известные ошибки edge-функции в понятный текст. */
function humanizeShareError(error: string): string {
  if (error === 'Google Drive not connected') {
    return 'Google Drive не подключён — подключите его в профиле'
  }
  if (error === 'insufficient_permissions') {
    return 'Ваш Google-аккаунт не может делиться этой папкой. Делиться может владелец папки на Google Drive.'
  }
  if (error === 'folder_not_found') {
    return 'Папка не найдена на Google Drive (возможно, удалена или нет доступа)'
  }
  return error
}
