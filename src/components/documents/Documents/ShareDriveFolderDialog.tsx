"use client"

/**
 * Диалог «Доступ к папке Google Drive» — показывает участников проекта
 * с email из карточки, отмечает, у кого доступ к папке уже есть (Drive
 * permissions.list), и выдаёт доступ отмеченным через edge-функцию
 * google-drive-share-folder (без письма-уведомления от Google).
 * Делиться может только пользователь, чей Google-аккаунт имеет право
 * шарить эту папку (обычно — владелец/создатель папки).
 */

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GoogleDriveIcon } from '@/components/shared/GoogleDriveIcon'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type ShareRole = 'reader' | 'writer'

type ProjectEmailParticipant = {
  id: string
  name: string
  email: string
}

type DrivePermissionEntry = {
  id: string
  type: string
  role: string
  emailAddress: string | null
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  organizer: 'Владелец',
  fileOrganizer: 'Редактор',
  writer: 'Редактор',
  commenter: 'Комментирование',
  reader: 'Читатель',
}

export type ShareDriveFolderDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  projectId: string
  driveFolderId: string
  /** Название набора/папки — для заголовка диалога. */
  folderName: string
}

/** Участники проекта, у которых в карточке заполнен email. */
function useProjectEmailParticipants(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['project-email-participants', projectId],
    queryFn: async (): Promise<ProjectEmailParticipant[]> => {
      const { data, error } = await supabase
        .from('project_participants')
        .select('participants!inner(id, name, last_name, email, is_deleted)')
        .eq('project_id', projectId)
      if (error) throw error
      const seen = new Set<string>()
      const result: ProjectEmailParticipant[] = []
      for (const row of data ?? []) {
        const p = row.participants as unknown as {
          id: string
          name: string | null
          last_name: string | null
          email: string | null
          is_deleted: boolean | null
        }
        const email = (p.email ?? '').trim()
        if (p.is_deleted || !EMAIL_RE.test(email)) continue
        const key = email.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        result.push({
          id: p.id,
          name: [p.name, p.last_name].filter(Boolean).join(' ').trim() || email,
          email,
        })
      }
      return result
    },
    enabled,
  })
}

/** Текущие доступы папки на Drive (кто уже имеет доступ). */
function useDriveFolderPermissions(workspaceId: string, driveFolderId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['drive-folder-permissions', driveFolderId],
    queryFn: async (): Promise<DrivePermissionEntry[]> => {
      const { data, error } = await supabase.functions.invoke('google-drive-share-folder', {
        body: { action: 'list', workspaceId, folderId: driveFolderId },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return (data?.permissions ?? []) as DrivePermissionEntry[]
    },
    enabled,
  })
}

export function ShareDriveFolderDialog({
  open,
  onOpenChange,
  workspaceId,
  projectId,
  driveFolderId,
  folderName,
}: ShareDriveFolderDialogProps) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [extraEmail, setExtraEmail] = useState('')
  const [role, setRole] = useState<ShareRole>('reader')
  const [submitting, setSubmitting] = useState(false)

  const { data: participants = [], isLoading: participantsLoading } = useProjectEmailParticipants(
    projectId,
    open,
  )
  const {
    data: permissions = [],
    isLoading: permissionsLoading,
    error: permissionsError,
  } = useDriveFolderPermissions(workspaceId, driveFolderId, open)

  // email (lowercase) → роль на Drive
  const accessByEmail = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of permissions) {
      if (p.emailAddress) map.set(p.emailAddress.toLowerCase(), p.role)
    }
    return map
  }, [permissions])

  // Доступы папки у людей ВНЕ списка участников проекта — показываем отдельным
  // блоком, чтобы был виден полный список «у кого есть доступ» (как в Drive).
  const externalAccess = useMemo(() => {
    const participantEmails = new Set(participants.map((p) => p.email.toLowerCase()))
    return permissions.filter(
      (p) => p.emailAddress && !participantEmails.has(p.emailAddress.toLowerCase()),
    )
  }, [permissions, participants])

  const toggle = (email: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      const key = email.toLowerCase()
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const extraEmailTrimmed = extraEmail.trim()
  const extraEmailValid = extraEmailTrimmed === '' || EMAIL_RE.test(extraEmailTrimmed)

  const emailsToGrant = useMemo(() => {
    const list = participants
      .filter((p) => selected.has(p.email.toLowerCase()))
      .map((p) => p.email)
    if (extraEmailTrimmed && EMAIL_RE.test(extraEmailTrimmed)) {
      const key = extraEmailTrimmed.toLowerCase()
      if (!list.some((e) => e.toLowerCase() === key)) list.push(extraEmailTrimmed)
    }
    return list
  }, [participants, selected, extraEmailTrimmed])

  const resetAndClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelected(new Set())
      setExtraEmail('')
    }
    onOpenChange(nextOpen)
  }

  const handleShare = async () => {
    if (emailsToGrant.length === 0 || submitting) return
    setSubmitting(true)
    try {
      const { data, error } = await supabase.functions.invoke('google-drive-share-folder', {
        body: { workspaceId, folderId: driveFolderId, emails: emailsToGrant, role },
      })
      if (error) throw error
      if (data?.error) {
        toast.error(humanizeShareError(data.error))
        return
      }
      const granted: string[] = data?.granted ?? []
      const failed: Array<{ email: string; error: string }> = data?.failed ?? []
      if (granted.length > 0) {
        toast.success(`Доступ выдан: ${granted.join(', ')}`)
      }
      for (const f of failed) {
        toast.error(`${f.email}: ${humanizeShareError(f.error)}`)
      }
      // Обновить бейджи «есть доступ»
      await queryClient.invalidateQueries({ queryKey: ['drive-folder-permissions', driveFolderId] })
      if (failed.length === 0) resetAndClose(false)
      else setSelected(new Set(failed.map((f) => f.email.toLowerCase())))
    } catch (err) {
      logger.error('Failed to share Drive folder', err)
      toast.error('Не удалось выдать доступ к папке')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GoogleDriveIcon className="h-5 w-5 shrink-0" />
            Доступ к папке на Google Drive
          </DialogTitle>
          <DialogDescription>
            Папка «{folderName}». Отметьте, кому выдать доступ — без письма-уведомления.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Участники проекта с email</Label>
            {participantsLoading ? (
              <p className="text-sm text-muted-foreground py-2">Загружаю участников…</p>
            ) : participants.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                У участников проекта не заполнен email в карточке
              </p>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
                {participants.map((p) => {
                  const key = p.email.toLowerCase()
                  const existingRole = accessByEmail.get(key)
                  const checked = selected.has(key)
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/40"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggle(p.email)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm truncate">{p.name}</span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {p.email}
                        </span>
                      </span>
                      {existingRole && (
                        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[11px] font-medium">
                          <Check className="h-3 w-3" />
                          {ROLE_LABELS[existingRole] ?? 'Есть доступ'}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            )}
            {permissionsLoading && (
              <p className="text-xs text-muted-foreground">Проверяю, у кого уже есть доступ…</p>
            )}
            {!!permissionsError && (
              <p className="text-xs text-amber-600">
                Не удалось получить текущие доступы папки — пометки «есть доступ» недоступны
              </p>
            )}
          </div>
          {externalAccess.length > 0 && (
            <div className="space-y-1.5">
              <Label>Также имеют доступ</Label>
              <div className="max-h-40 overflow-y-auto rounded-md border divide-y">
                {externalAccess.map((p) => (
                  <div key={p.id} className="flex items-center gap-2.5 px-3 py-1.5">
                    <span className="min-w-0 flex-1 text-sm truncate">{p.emailAddress}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {ROLE_LABELS[p.role] ?? p.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="drive-share-extra-email">Другой email (необязательно)</Label>
            <Input
              id="drive-share-extra-email"
              type="email"
              placeholder="client@gmail.com"
              value={extraEmail}
              onChange={(e) => setExtraEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleShare()
              }}
            />
            {!extraEmailValid && (
              <p className="text-xs text-destructive">Похоже, email с опечаткой</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Уровень доступа</Label>
            <Select value={role} onValueChange={(v) => setRole(v as ShareRole)}>
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
          <Button variant="outline" onClick={() => resetAndClose(false)} disabled={submitting}>
            Отмена
          </Button>
          <Button
            onClick={handleShare}
            disabled={emailsToGrant.length === 0 || !extraEmailValid || submitting}
          >
            {submitting
              ? 'Выдаю доступ…'
              : `Выдать доступ${emailsToGrant.length > 0 ? ` (${emailsToGrant.length})` : ''}`}
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
  if (error === 'internal_error') {
    return 'Не удалось выдать доступ'
  }
  return error
}
