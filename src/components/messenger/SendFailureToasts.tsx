"use client"

/**
 * Sticky-toast'ы про неотправленные сообщения.
 *
 * Подписывается на `useMyUnresolvedSendFailures(workspaceId)` (initial fetch +
 * realtime). Для каждого нового failure — показывает persistent toast с
 * кнопкой «Открыть чат». Клик по кнопке открывает соответствующий тред и
 * помечает failure как resolved.
 *
 * Toast'ы:
 *  - persistent (`duration: Infinity`) — не пропадают сами;
 *  - дедупятся по `failure.id` через ref-сет, чтобы при ре-рендере не
 *    показывать повторно;
 *  - автоматически снимаются (`toast.dismiss(id)`) когда failure
 *    resolved (например, юзер закрыл его на странице журнала).
 *
 * Компонент ничего не рендерит — только side-effect.
 */

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import {
  useMyUnresolvedSendFailures,
  useResolveSendFailure,
  type SendFailureRow,
} from '@/hooks/messenger/useSendFailures'
import { globalOpenThread } from '@/components/tasks/TaskPanelContext'
import { logger } from '@/utils/logger'

type SendFailureToastsProps = {
  workspaceId: string
}

export function SendFailureToasts({ workspaceId }: SendFailureToastsProps) {
  const { data: failures } = useMyUnresolvedSendFailures(workspaceId)
  const resolve = useResolveSendFailure(workspaceId)

  // id уже показанных toast'ов, чтобы не дублировать при ре-рендере или при
  // initial fetch (старые fails показывать тоже надо — но один раз).
  const shownRef = useRef<Set<string>>(new Set())
  // Связка failure.id → toast.id (для dismiss при resolve).
  const toastIdRef = useRef<Map<string, string | number>>(new Map())

  useEffect(() => {
    if (!failures) return

    // Показ новых.
    for (const f of failures) {
      if (shownRef.current.has(f.id)) continue
      shownRef.current.add(f.id)
      const tid = showFailureToast(
        f,
        async () => {
          // «Открыть чат»: пытаемся открыть тред в правой панели и помечаем
          // failure как resolved. Если треда нет (удалён) — просто резолвим.
          if (f.thread_id) {
            await openThread(f.thread_id)
          }
          try {
            await resolve.mutateAsync(f.id)
          } catch (err) {
            logger.warn('resolve send failure:', err)
          }
          toast.dismiss(tid)
          toastIdRef.current.delete(f.id)
        },
        async () => {
          // «Повторить»: переключаем send_status сообщения обратно в pending,
          // БД-триггер notify_on_send_status_retry дёргает диспетчер канала.
          const meta = (f.metadata as Record<string, unknown> | null) ?? {}
          const messageId = (meta.project_message_id as string | undefined) ??
            (meta.message_id as string | undefined)
          if (!messageId) {
            toast.error('Не удалось найти сообщение для повтора')
            return
          }
          const { error: retryErr } = await supabase
            .from('project_messages')
            .update({
              send_status: 'pending',
              send_failed_reason: null,
              send_attempted_at: new Date().toISOString(),
            })
            .eq('id', messageId)
          if (retryErr) {
            toast.error('Не удалось запустить повтор')
            return
          }
          try {
            await resolve.mutateAsync(f.id)
          } catch (err) {
            logger.warn('resolve send failure after retry:', err)
          }
          toast.success('Повторная отправка запущена')
          toast.dismiss(tid)
          toastIdRef.current.delete(f.id)
        },
      )
      toastIdRef.current.set(f.id, tid)
    }

    // Снимаем toast'ы для failures, которых больше нет в unresolved
    // (значит юзер их уже зарезолвил где-то ещё).
    const aliveIds = new Set(failures.map((f) => f.id))
    for (const [failureId, tid] of toastIdRef.current.entries()) {
      if (!aliveIds.has(failureId)) {
        toast.dismiss(tid)
        toastIdRef.current.delete(failureId)
      }
    }
  }, [failures, resolve])

  return null
}

/** Достаёт минимально необходимый TaskItem для globalOpenThread. */
async function openThread(threadId: string): Promise<void> {
  const { data: thread } = await supabase
    .from('project_threads')
    .select(
      'id, name, type, project_id, workspace_id, status_id, deadline, accent_color, icon, is_pinned, created_at, created_by, sort_order',
    )
    .eq('id', threadId)
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

function showFailureToast(
  f: SendFailureRow,
  onOpen: () => void,
  onRetry: () => void,
) {
  const preview = (f.content ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 80)
  const title = 'Не удалось отправить сообщение'
  const description = preview
    ? `«${preview}${preview.length === 80 ? '…' : ''}»`
    : f.error_text
  const meta = (f.metadata as Record<string, unknown> | null) ?? {}
  const hasMessageId = !!(meta.project_message_id || meta.message_id)
  return toast.error(title, {
    description,
    duration: Infinity,
    action: hasMessageId
      ? { label: 'Повторить', onClick: onRetry }
      : f.thread_id
        ? { label: 'Открыть чат', onClick: onOpen }
        : undefined,
    cancel: hasMessageId && f.thread_id
      ? { label: 'Открыть', onClick: onOpen }
      : undefined,
  })
}
