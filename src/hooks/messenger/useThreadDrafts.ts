import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { getMyDraftPreviews, type DraftPreview } from '@/services/api/messenger/threadDraftService'
import { subscribeDraftChanges } from '@/components/messenger/hooks/draftChangeBus'
import { stripHtml } from '@/utils/format/messengerHtml'

export const threadDraftKeys = {
  previews: (workspaceId: string) => ['thread-drafts', 'previews', workspaceId] as const,
}

/**
 * Выбрать текст пометки «Черновик» для строки инбокса.
 *
 * Локальная версия приоритетнее серверной: на ЭТОМ устройстве она свежее
 * (сервер отстаёт на debounce синхронизации). Серверная нужна, чтобы пометка
 * была видна и на других устройствах — иначе тред в списке есть, а почему он
 * там, непонятно.
 *
 * Черновик из одних файлов текста не имеет — показываем маркер вложения.
 */
export function resolveDraftPreview(
  serverDraft: DraftPreview | undefined,
  localHtml: string | null,
): string | null {
  const local = localHtml ? stripHtml(localHtml).trim() : ''
  if (local) return local
  const remote = serverDraft?.content ? stripHtml(serverDraft.content).trim() : ''
  if (remote) return remote
  if (serverDraft?.hasFiles) return '📎 Файл'
  return null
}

/** Мои черновики воркспейса: thread_id → превью. Обновляется при правке черновика. */
export function useMyDraftPreviews(workspaceId: string | undefined) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: threadDraftKeys.previews(workspaceId ?? ''),
    queryFn: () => getMyDraftPreviews(workspaceId!, user!.id),
    enabled: !!workspaceId && !!user,
  })

  // Черновик правится в этой же вкладке — ни localStorage, ни сеть об этом не
  // уведомляют, поэтому слушаем свою шину.
  useEffect(() => {
    if (!workspaceId) return
    return subscribeDraftChanges(() => {
      void queryClient.invalidateQueries({ queryKey: threadDraftKeys.previews(workspaceId) })
    })
  }, [queryClient, workspaceId])

  return useMemo(() => new Map((data ?? []).map((d) => [d.threadId, d])), [data])
}
