"use client"

/**
 * useThreadFromPanelTab — резолвит thread из panelTab=thread:<short|uuid> в URL
 * и возвращает project_id треда. Используется TaskPanelTabbedShell на страницах
 * без активного проекта (/boards, /inbox) — чтобы при открытии короткой ссылки
 * (`?panelTab=thread:385`) панель смогла подхватить scope правильного проекта.
 */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface ResolvedThread {
  threadUuid: string
  projectId: string
}

export function useThreadFromPanelTab(workspaceId: string | null | undefined): ResolvedThread | null {
  const searchParams = useSearchParams()
  const panelTab = searchParams?.get('panelTab') ?? null

  const [parsed, setParsed] = useState<{ shortId?: number; uuid?: string } | null>(null)

  useEffect(() => {
    if (!panelTab || !panelTab.startsWith('thread:')) {
      setParsed(null)
      return
    }
    const ref = panelTab.slice('thread:'.length)
    if (/^\d+$/.test(ref)) {
      setParsed({ shortId: parseInt(ref, 10) })
    } else if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)
    ) {
      setParsed({ uuid: ref })
    } else {
      setParsed(null)
    }
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
        .select('id, project_id')
        .eq('id', threadUuid)
        .maybeSingle()
      if (!thread || !thread.project_id) return null
      return { threadUuid: thread.id, projectId: thread.project_id }
    },
    staleTime: 60_000,
  })

  return data ?? null
}
