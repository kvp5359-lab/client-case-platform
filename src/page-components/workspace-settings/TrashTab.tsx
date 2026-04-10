"use client"

/**
 * TrashTab — вкладка «Корзина» в настройках воркспейса.
 *
 * Показывает мягко удалённые проекты и треды (задачи, чаты, email).
 * Даёт возможность восстановить или удалить навсегда.
 *
 * Доступ: только владелец воркспейса.
 */

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  Trash2,
  RotateCcw,
  Folder,
  CheckSquare,
  MessageSquare,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useWorkspacePermissions } from '@/hooks/permissions'
import {
  useTrashedProjects,
  useTrashedThreads,
  useRestoreProject,
  useRestoreThread,
  useHardDeleteProject,
  useHardDeleteThread,
  type TrashedProject,
  type TrashedThread,
} from '@/hooks/useTrash'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

// ── Утилита: «12 марта 2026, 14:30» ──
function formatDeletedAt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function threadIcon(type: 'chat' | 'task') {
  if (type === 'task') return <CheckSquare className="w-4 h-4 text-blue-500" />
  return <MessageSquare className="w-4 h-4 text-slate-500" />
}

function threadTypeLabel(type: 'chat' | 'task'): string {
  return type === 'task' ? 'Задача' : 'Чат'
}

export function TrashTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const permissions = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const [busyId, setBusyId] = useState<string | null>(null)

  const { data: projects = [], isLoading: loadingProjects } = useTrashedProjects(workspaceId)
  const { data: threads = [], isLoading: loadingThreads } = useTrashedThreads(workspaceId)

  const restoreProject = useRestoreProject(workspaceId || '')
  const hardDeleteProject = useHardDeleteProject(workspaceId || '')
  const restoreThread = useRestoreThread(workspaceId || '')
  const hardDeleteThread = useHardDeleteThread(workspaceId || '')

  // ── Guard: только владелец ──
  if (permissions.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!permissions.isOwner) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Доступ запрещён</CardTitle>
          <CardDescription>
            Раздел «Корзина» доступен только владельцу рабочего пространства.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  // ── Действия над проектами ──
  const onRestoreProject = async (p: TrashedProject) => {
    setBusyId(p.id)
    try {
      await restoreProject.mutateAsync({ id: p.id, name: p.name })
      toast.success(`Проект «${p.name}» восстановлен`)
    } catch {
      toast.error('Не удалось восстановить проект')
    } finally {
      setBusyId(null)
    }
  }

  const onHardDeleteProject = async (p: TrashedProject) => {
    const ok = await confirm({
      title: 'Удалить проект навсегда?',
      description: `Проект «${p.name}» и все его задачи, чаты, документы будут удалены без возможности восстановления. Это действие необратимо.`,
      variant: 'destructive',
      confirmText: 'Удалить навсегда',
    })
    if (!ok) return
    setBusyId(p.id)
    try {
      await hardDeleteProject.mutateAsync({ id: p.id, name: p.name })
      toast.success(`Проект «${p.name}» удалён навсегда`)
    } catch {
      toast.error('Не удалось удалить проект')
    } finally {
      setBusyId(null)
    }
  }

  // ── Действия над тредами ──
  const onRestoreThread = async (t: TrashedThread) => {
    setBusyId(t.id)
    try {
      await restoreThread.mutateAsync({
        id: t.id,
        name: t.name,
        type: t.type,
        project_id: t.project_id,
      })
      toast.success(`${threadTypeLabel(t.type)} «${t.name}» восстановлена`)
    } catch {
      toast.error('Не удалось восстановить')
    } finally {
      setBusyId(null)
    }
  }

  const onHardDeleteThread = async (t: TrashedThread) => {
    const ok = await confirm({
      title: `Удалить ${t.type === 'task' ? 'задачу' : 'чат'} навсегда?`,
      description: `«${t.name}» и все сообщения будут удалены без возможности восстановления.`,
      variant: 'destructive',
      confirmText: 'Удалить навсегда',
    })
    if (!ok) return
    setBusyId(t.id)
    try {
      await hardDeleteThread.mutateAsync({
        id: t.id,
        name: t.name,
        type: t.type,
        project_id: t.project_id,
      })
      toast.success('Удалено навсегда')
    } catch {
      toast.error('Не удалось удалить')
    } finally {
      setBusyId(null)
    }
  }

  const isLoading = loadingProjects || loadingThreads
  const isEmpty = !isLoading && projects.length === 0 && threads.length === 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Корзина</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Удалённые проекты и треды (задачи, чаты, email). Восстановите или удалите навсегда.
        </p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {isEmpty && (
        <Card>
          <CardContent className="py-12 text-center">
            <Trash2 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Корзина пуста</p>
          </CardContent>
        </Card>
      )}

      {/* Проекты */}
      {!isLoading && projects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Folder className="w-4 h-4" />
              Проекты <span className="text-muted-foreground font-normal">({projects.length})</span>
            </CardTitle>
            <CardDescription>
              Восстановление проекта возвращает и все его задачи, чаты, документы.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {projects.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 py-2 px-3 rounded-md border bg-background hover:bg-muted/30 transition-colors"
              >
                <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    Удалён {formatDeletedAt(p.deleted_at)}
                    {p.deleted_by_name ? ` · ${p.deleted_by_name}` : ''}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={busyId === p.id}
                  onClick={() => onRestoreProject(p)}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Восстановить
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-destructive hover:text-destructive"
                  disabled={busyId === p.id}
                  onClick={() => onHardDeleteProject(p)}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Удалить навсегда
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Треды */}
      {!isLoading && threads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="w-4 h-4" />
              Задачи и чаты{' '}
              <span className="text-muted-foreground font-normal">({threads.length})</span>
            </CardTitle>
            <CardDescription>
              Треды, удалённые отдельно от своих проектов. Треды внутри удалённых проектов
              восстанавливаются вместе с проектом.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {threads.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 py-2 px-3 rounded-md border bg-background hover:bg-muted/30 transition-colors"
              >
                {threadIcon(t.type)}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {threadTypeLabel(t.type)}
                    {t.project_name ? ` · ${t.project_name}` : ''} · удалено{' '}
                    {formatDeletedAt(t.deleted_at)}
                    {t.deleted_by_name ? ` · ${t.deleted_by_name}` : ''}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={busyId === t.id}
                  onClick={() => onRestoreThread(t)}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Восстановить
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-destructive hover:text-destructive"
                  disabled={busyId === t.id}
                  onClick={() => onHardDeleteThread(t)}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Удалить навсегда
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  )
}
