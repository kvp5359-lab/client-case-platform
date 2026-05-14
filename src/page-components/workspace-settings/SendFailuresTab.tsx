"use client"

/**
 * SendFailuresTab — журнал неудачных попыток отправки сообщений по воркспейсу.
 *
 * Доступ: владелец воркспейса или роль с `manage_workspace_settings`.
 * Источник: таблица `message_send_failures` через хук `useWorkspaceSendFailures`.
 *
 * Что показывает:
 *  - таблицу всех failure-записей с фильтром «только незакрытые / все»;
 *  - имя автора, чат/проект, превью сообщения, текст ошибки, время;
 *  - действия: «Открыть чат», «Скрыть» (resolved_at = now).
 *
 * Что НЕ делает: повторную отправку. Текст возвращён в черновик автора —
 * исправлять должен сам автор в его сессии.
 */

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { AlertTriangle, ArrowRight, Check, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  useWorkspaceSendFailures,
  useResolveSendFailure,
  type SendFailureRow,
} from '@/hooks/messenger/useSendFailures'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { supabase } from '@/lib/supabase'
import { globalOpenThread } from '@/components/tasks/TaskPanelContext'

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function previewContent(c: string | null): string {
  if (!c) return ''
  return c.replace(/<[^>]+>/g, '').trim()
}

export function SendFailuresTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const permissions = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  const canManage =
    permissions.isOwner || permissions.can('manage_workspace_settings')

  const [includeResolved, setIncludeResolved] = useState(false)
  const { data: failures = [], isLoading, refetch, isFetching } =
    useWorkspaceSendFailures(workspaceId, includeResolved)
  const resolve = useResolveSendFailure(workspaceId)
  const { data: participants = [] } = useWorkspaceParticipants(workspaceId)

  const userIdToName = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of participants) {
      if (!p.user_id) continue
      const full = [p.name, p.last_name].filter(Boolean).join(' ')
      m.set(p.user_id, full || p.email || '—')
    }
    return m
  }, [participants])

  if (!canManage) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Раздел доступен только владельцу воркспейса или участнику с правом «Управление настройками».
        </CardContent>
      </Card>
    )
  }

  const handleOpenThread = async (f: SendFailureRow) => {
    if (!f.thread_id) return
    const { data: thread } = await supabase
      .from('project_threads')
      .select(
        'id, name, type, project_id, workspace_id, status_id, deadline, accent_color, icon, is_pinned, created_at, created_by, sort_order',
      )
      .eq('id', f.thread_id)
      .eq('is_deleted', false)
      .maybeSingle()
    if (!thread) return
    globalOpenThread({
      id: thread.id,
      name: thread.name,
      type: thread.type as 'chat' | 'task',
      project_id: thread.project_id,
      workspace_id: thread.workspace_id,
      status_id: thread.status_id,
      deadline: thread.deadline,
      accent_color: thread.accent_color,
      icon: thread.icon,
      is_pinned: thread.is_pinned,
      created_at: thread.created_at,
      created_by: thread.created_by,
      sort_order: thread.sort_order ?? 0,
    })
  }

  const unresolvedCount = failures.filter((f) => !f.resolved_at).length

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <CardTitle className="text-base">Журнал неотправленных сообщений</CardTitle>
            <CardDescription className="mt-0.5">
              Все попытки отправки, которые не дошли до получателя. Текст
              сохранён в черновике у автора в его сессии. Менеджер видит
              историю по всем сотрудникам.
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-xs">
            {includeResolved ? `${failures.length} всего` : `${unresolvedCount} активных`}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Обновить"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Button
            variant={includeResolved ? 'outline' : 'default'}
            size="sm"
            onClick={() => setIncludeResolved(false)}
          >
            Только активные
          </Button>
          <Button
            variant={includeResolved ? 'default' : 'outline'}
            size="sm"
            onClick={() => setIncludeResolved(true)}
          >
            Все, включая закрытые
          </Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-6">Загрузка…</div>
        ) : failures.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6">
            Нет {includeResolved ? 'записей' : 'активных ошибок отправки'}. Это хорошо.
          </div>
        ) : (
          <div className="rounded-md border divide-y">
            {failures.map((f) => {
              const author = userIdToName.get(f.user_id) ?? '—'
              const preview = previewContent(f.content)
              const isResolved = !!f.resolved_at
              return (
                <div
                  key={f.id}
                  className={`flex items-start gap-3 p-3 ${isResolved ? 'opacity-60' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <span className="font-medium text-foreground">{author}</span>
                      <span>·</span>
                      <span>{formatTime(f.created_at)}</span>
                      {f.source && (
                        <>
                          <span>·</span>
                          <span>{f.source}</span>
                        </>
                      )}
                      {isResolved && (
                        <Badge variant="secondary" className="text-[10px]">закрыто</Badge>
                      )}
                    </div>
                    {preview ? (
                      <div className="text-sm text-foreground line-clamp-2 mb-1">
                        {preview}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic mb-1">
                        (без текста)
                      </div>
                    )}
                    <div className="text-[11px] text-red-700 dark:text-red-400">
                      {f.error_text}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {f.thread_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => handleOpenThread(f)}
                        title="Открыть чат"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {!isResolved && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-muted-foreground"
                        onClick={() => resolve.mutate(f.id)}
                        title="Закрыть"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
