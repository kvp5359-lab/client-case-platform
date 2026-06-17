"use client"

/**
 * Карта участников проектов по ролям — для роль-специфичных колонок в списках
 * проектов (Исполнители / Администраторы / Клиенты / Наблюдатели).
 *
 * Ключ карты — `${projectId}:${roleName}` → массив участников этой роли.
 * Чанкуем IN-фильтр (как useTaskAssigneesMap) против URL-лимита PostgREST.
 */

import { useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { STALE_TIME } from '@/hooks/queryKeys'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'

const CHUNK = 40

type Row = {
  project_id: string
  project_roles: string[] | null
  participants: AvatarParticipant & { is_deleted?: boolean }
}

export function useProjectPeopleByRole(projectIds: string[]) {
  const key = [...projectIds].sort().join(',')
  const query = useQuery({
    queryKey: ['project-people-by-role', key],
    enabled: projectIds.length > 0,
    staleTime: STALE_TIME.SHORT,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Map<string, AvatarParticipant[]>> => {
      const chunks: string[][] = []
      for (let i = 0; i < projectIds.length; i += CHUNK) chunks.push(projectIds.slice(i, i + CHUNK))

      const results = await Promise.all(
        chunks.map((chunk) =>
          supabase
            .from('project_participants')
            .select('project_id, project_roles, participants!inner(id, name, last_name, avatar_url, is_deleted)')
            .in('project_id', chunk),
        ),
      )

      const map = new Map<string, AvatarParticipant[]>()
      for (const { data, error } of results) {
        if (error) throw error
        for (const r of (data ?? []) as unknown as Row[]) {
          const p = r.participants
          if (!p || p.is_deleted) continue
          for (const role of r.project_roles ?? []) {
            const k = `${r.project_id}:${role}`
            const arr = map.get(k)
            const person: AvatarParticipant = {
              id: p.id,
              name: p.name,
              last_name: p.last_name,
              avatar_url: p.avatar_url,
            }
            if (arr) arr.push(person)
            else map.set(k, [person])
          }
        }
      }
      return map
    },
  })
  return useMemo(() => query.data ?? new Map<string, AvatarParticipant[]>(), [query.data])
}
