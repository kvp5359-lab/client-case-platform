"use client"

/**
 * useThreadAuditEvents — загружает audit-события треда для отображения в ленте чата.
 * Возвращает плоский массив событий, отсортированных по дате.
 * Резолвит имена авторов и названия статусов.
 */

import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ThreadAuditEvent {
  id: string
  action: string
  details: Record<string, unknown>
  created_at: string
  actor_name: string | null
  /** Pre-formatted human-readable text for display */
  display_text: string
}

const ACTION_LABELS: Record<string, string> = {
  change_status: 'изменил(а) статус',
  change_deadline: 'изменил(а) дедлайн',
  rename: 'переименовал(а)',
  create: 'создал(а)',
  delete: 'удалил(а)',
  change_settings: 'изменил(а) настройки',
  pin: 'закрепил(а)',
  unpin: 'открепил(а)',
  change_assignees: 'изменил(а) исполнителей',
}

function formatDeadline(iso: string | null | undefined): string {
  if (!iso) return 'без срока'
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function buildDisplayText(
  action: string,
  actorName: string,
  details: Record<string, unknown>,
  statusMap: Record<string, string>,
): string {
  const label = ACTION_LABELS[action] ?? action

  if (action === 'change_status') {
    const oldName = statusMap[details.old_status as string] ?? 'без статуса'
    const newName = statusMap[details.new_status as string] ?? 'без статуса'
    return `${actorName} ${label}: ${oldName} → ${newName}`
  }

  if (action === 'change_deadline') {
    const oldD = formatDeadline(details.old_deadline as string | null)
    const newD = formatDeadline(details.new_deadline as string | null)
    return `${actorName} ${label}: ${oldD} → ${newD}`
  }

  if (action === 'rename') {
    return `${actorName} ${label}: «${details.old_name}» → «${details.new_name}»`
  }

  return `${actorName} ${label}`
}

export function formatAuditEvent(event: ThreadAuditEvent): string {
  return event.display_text
}

export function useThreadAuditEvents(threadId: string | undefined) {
  const query = useQuery({
    queryKey: ['thread-audit-events', threadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, details, created_at, user_id')
        .eq('resource_id', threadId!)
        .in('resource_type', ['task', 'thread'])
        .order('created_at', { ascending: true })
        .limit(200)

      if (error) throw error
      if (!data || data.length === 0) return []

      // Resolve actor names from user_ids
      const userIds = [...new Set(data.map((e) => e.user_id).filter(Boolean))]
      const nameMap: Record<string, string> = {}

      if (userIds.length > 0) {
        const { data: participants } = await supabase
          .from('participants')
          .select('user_id, name, last_name')
          .in('user_id', userIds)

        if (participants) {
          for (const p of participants) {
            if (p.user_id) {
              nameMap[p.user_id] = p.last_name ? `${p.name} ${p.last_name}` : p.name
            }
          }
        }
      }

      // Resolve status names from status UUIDs in details
      const statusIds = new Set<string>()
      for (const e of data) {
        const d = (e.details ?? {}) as Record<string, unknown>
        if (d.old_status && typeof d.old_status === 'string') statusIds.add(d.old_status)
        if (d.new_status && typeof d.new_status === 'string') statusIds.add(d.new_status)
      }
      const statusMap: Record<string, string> = {}
      if (statusIds.size > 0) {
        const { data: statuses } = await supabase
          .from('statuses')
          .select('id, name')
          .in('id', [...statusIds])
        if (statuses) {
          for (const s of statuses) {
            statusMap[s.id] = s.name
          }
        }
      }

      return data.map((e) => {
        const details = (e.details ?? {}) as Record<string, unknown>
        const actorName = e.user_id ? nameMap[e.user_id] ?? 'Система' : 'Система'
        return {
          id: e.id,
          action: e.action,
          details,
          created_at: e.created_at,
          actor_name: actorName,
          display_text: buildDisplayText(e.action, actorName, details, statusMap),
        }
      }) as ThreadAuditEvent[]
    },
    enabled: !!threadId,
    staleTime: 30_000,
  })

  // Realtime: refetch when new audit_logs appear for this thread
  const queryClient = useQueryClient()
  const instanceId = useRef(Math.random().toString(36).slice(2))
  useEffect(() => {
    if (!threadId) return

    const channel = supabase
      .channel(`audit-events:${threadId}:${instanceId.current}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_logs',
          filter: `resource_id=eq.${threadId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['thread-audit-events', threadId] })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [threadId, queryClient])

  return query
}
