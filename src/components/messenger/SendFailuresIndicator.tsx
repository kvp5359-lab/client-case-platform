"use client"

/**
 * Индикатор-пилюля «⚠ N не отправлено» в сайдбаре воркспейса.
 *
 * Показывается, только когда у текущего юзера есть незакрытые failures
 * в этом воркспейсе. Клик открывает popover со списком, по каждому:
 *   - превью сообщения (truncate),
 *   - имя/время,
 *   - кнопка «Открыть чат» (resolve + открытие треда),
 *   - кнопка «Скрыть» (resolve без открытия).
 * Внизу — «Скрыть все».
 */

import { AlertTriangle, X, ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  useMyUnresolvedSendFailures,
  useResolveSendFailure,
  useResolveAllMySendFailures,
  type SendFailureRow,
} from '@/hooks/messenger/useSendFailures'
import { globalOpenThread } from '@/components/tasks/TaskPanelContext'
import { cn } from '@/lib/utils'

type Props = {
  workspaceId: string | undefined
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
}

function previewContent(c: string | null): string {
  if (!c) return ''
  return c.replace(/<[^>]+>/g, '').trim()
}

export function SendFailuresIndicator({ workspaceId }: Props) {
  const { data: failures = [] } = useMyUnresolvedSendFailures(workspaceId)
  const resolve = useResolveSendFailure(workspaceId)
  const resolveAll = useResolveAllMySendFailures(workspaceId)
  const [open, setOpen] = useState(false)

  if (!workspaceId || failures.length === 0) return null

  const handleOpenThread = async (f: SendFailureRow) => {
    if (f.thread_id) {
      const { data: thread } = await supabase
        .from('project_threads')
        .select(
          'id, name, type, project_id, workspace_id, status_id, deadline, accent_color, icon, is_pinned, created_at, created_by, sort_order',
        )
        .eq('id', f.thread_id)
        .eq('is_deleted', false)
        .maybeSingle()
      if (thread) {
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
    }
    await resolve.mutateAsync(f.id).catch(() => undefined)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'mx-2 mb-2 mt-1 flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs',
            'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900',
            'text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors',
          )}
          aria-label={`Не отправлено: ${failures.length}`}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">{failures.length}</span>
          <span className="truncate">не отправлено</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-medium">Не отправленные сообщения</div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => resolveAll.mutate()}
            disabled={resolveAll.isPending}
            className="h-7 text-xs"
          >
            Скрыть все
          </Button>
        </div>
        <ScrollArea className="max-h-[60vh]">
          <ul className="divide-y">
            {failures.map((f) => {
              const preview = previewContent(f.content)
              return (
                <li key={f.id} className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      {preview ? (
                        <div className="text-sm text-foreground line-clamp-2 mb-1">
                          {preview}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground italic mb-1">
                          (без текста)
                        </div>
                      )}
                      <div className="text-[11px] text-muted-foreground">
                        {formatTime(f.created_at)} · {f.error_text}
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
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-muted-foreground"
                        onClick={() => resolve.mutate(f.id)}
                        title="Скрыть"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
