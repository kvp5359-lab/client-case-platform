"use client"

/**
 * useThreadFromPanelTab — резолвит thread из panelTab=thread:<short|uuid> в URL.
 * Используется TaskPanelTabbedShell на страницах без активного проекта
 * (/boards, /inbox) — чтобы при открытии shareable-ссылки (`?panelTab=thread:385`)
 * панель смогла подхватить правильный scope: проект, контакт или standalone
 * (личный диалог TG/Wazzup/Email/MTProto без проекта).
 *
 * Возвращает достаточно полей для восстановления standalone-треда напрямую,
 * без ожидания клика пользователя (см. TaskPanelTabbedShell — useEffect
 * восстановления панели из URL).
 */

import { useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type ResolvedThread = {
  threadUuid: string
  name: string
  type: 'task' | 'chat' | 'email'
  /** null для личных диалогов и контакт-scope тредов. */
  projectId: string | null
  /** null если тред привязан к проекту или это standalone личный диалог. */
  contactParticipantId: string | null
  icon: string | null
  accentColor: string | null
}

export function useThreadFromPanelTab(workspaceId: string | null | undefined): ResolvedThread | null {
  const searchParams = useSearchParams()
  const panelTab = searchParams?.get('panelTab') ?? null

  const parsed = useMemo<{ shortId?: number; uuid?: string } | null>(() => {
    if (!panelTab || !panelTab.startsWith('thread:')) return null
    const ref = panelTab.slice('thread:'.length)
    if (/^\d+$/.test(ref)) return { shortId: parseInt(ref, 10) }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) {
      return { uuid: ref }
    }
    return null
  }, [panelTab])

  const queryKey = parsed?.shortId
    ? ['resolve-thread', workspaceId, 'short', parsed.shortId]
    : parsed?.uuid
      ? ['resolve-thread', 'uuid', parsed.uuid]
      : ['resolve-thread', 'none']

  const { data } = useQuery({
    queryKey,
    enabled: !!parsed && !!workspaceId,
    queryFn: async (): Promise<ResolvedThread | null> => {
      let threadUuid: string | null = null
      if (parsed?.uuid) {
        threadUuid = parsed.uuid
      } else if (parsed?.shortId && workspaceId) {
        const { data: resolved } = await supabase.rpc('resolve_short_id', {
          p_workspace_id: workspaceId,
          p_entity_type: 'thread',
          p_short_id: parsed.shortId,
        })
        threadUuid = (resolved as string | null) ?? null
      }
      if (!threadUuid) return null

      const { data: thread } = await supabase
        .from('project_threads')
        .select('id, name, type, project_id, contact_participant_id, icon, accent_color')
        .eq('id', threadUuid)
        .maybeSingle()
      if (!thread) return null
      const row = thread as {
        id: string
        name: string
        type: 'task' | 'chat' | 'email'
        project_id: string | null
        contact_participant_id: string | null
        icon: string | null
        accent_color: string | null
      }
      return {
        threadUuid: row.id,
        name: row.name,
        type: row.type,
        projectId: row.project_id,
        contactParticipantId: row.contact_participant_id,
        icon: row.icon,
        accentColor: row.accent_color,
      }
    },
    staleTime: 60_000,
  })

  return data ?? null
}
