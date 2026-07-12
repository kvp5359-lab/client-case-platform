"use client"

/**
 * Баннер платформенных объявлений (админка → «Объявления»).
 * Показывается вверху воркспейса; скрытие запоминается per-объявление
 * в localStorage — после «×» повторно не всплывает.
 */

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

type Announcement = { id: string; message: string; level: 'info' | 'warning' }

const LS_KEY = 'cc_dismissed_announcements'

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

export function PlatformAnnouncementBanner() {
  const params = useParams<{ workspaceId?: string }>()
  const workspaceId = params?.workspaceId
  const [dismissed, setDismissed] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : readDismissed(),
  )

  const { data: announcements } = useQuery({
    queryKey: ['platform-announcements', workspaceId],
    enabled: !!workspaceId,
    staleTime: 300_000,
    queryFn: async (): Promise<Announcement[]> => {
      const { data, error } = await supabase.rpc(
        'get_active_announcements',
        { p_workspace_id: workspaceId! },
      )
      if (error) return []
      return (data as unknown as Announcement[]) ?? []
    },
  })

  const visible = (announcements ?? []).filter((a) => !dismissed.includes(a.id))
  if (visible.length === 0) return null

  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-50)
    setDismissed(next)
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next))
    } catch {
      /* localStorage может быть недоступен — просто скрываем в сессии */
    }
  }

  return (
    <div>
      {visible.map((a) => (
        <div
          key={a.id}
          className={
            a.level === 'warning'
              ? 'flex items-center gap-2 bg-amber-100 text-amber-900 px-4 py-2 text-sm'
              : 'flex items-center gap-2 bg-blue-50 text-blue-900 px-4 py-2 text-sm'
          }
        >
          <span>{a.level === 'warning' ? '⚠️' : 'ℹ️'}</span>
          <span className="flex-1">{a.message}</span>
          <button
            aria-label="Скрыть объявление"
            className="shrink-0 opacity-60 hover:opacity-100"
            onClick={() => dismiss(a.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
