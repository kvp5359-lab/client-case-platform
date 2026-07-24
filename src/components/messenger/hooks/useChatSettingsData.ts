/**
 * Хуки данных для ChatSettingsDialog.
 * Выделены из монолитного файла для улучшения читаемости.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { participantKeys, projectThreadKeys, chatSettingsKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { Participant } from '../chatSettingsTypes'

export function useProjectParticipants(projectId: string | undefined) {
  return useQuery({
    queryKey: participantKeys.projectLight(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_participants')
        .select(
          'participant_id, project_roles, participants!inner(id, name, last_name, avatar_url, is_deleted, user_id, workspace_roles)',
        )
        .eq('project_id', projectId!)
      if (error) throw error
      return (data ?? [])
        .map((pp) => {
          const p = pp.participants as unknown as Participant & { is_deleted?: boolean }
          return { ...p, project_roles: (pp.project_roles ?? []) as string[] }
        })
        .filter((p) => !p.is_deleted)
    },
    enabled: !!projectId,
    staleTime: STALE_TIME.STANDARD,
  })
}

/** Строка useWorkspaceProjects — единый тип для пикеров проекта
 *  (ChatSettingsProjectSelector, форма операций и т.п.). */
export type WorkspaceProjectOption = {
  id: string
  short_id: number | null
  name: string
  description: string | null
  currency: string | null
  template_id: string | null
  status_id: string | null
  project_templates: { name: string } | null
}

export function useWorkspaceProjects(workspaceId: string | undefined) {
  return useQuery({
    queryKey: chatSettingsKeys.workspaceProjects(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, short_id, name, description, currency, template_id, status_id, project_templates ( name )')
        .eq('workspace_id', workspaceId!)
        .eq('is_deleted', false)
        // По свежести: last_activity_at обновляется триггерами при сообщениях,
        // комментариях, документах, задачах, формах и изменении проекта —
        // недавно активные проекты вверху, далее по убыванию.
        .order('last_activity_at', { ascending: false, nullsFirst: false })
      if (error) throw error
      return (data ?? []) as WorkspaceProjectOption[]
    },
    enabled: !!workspaceId,
    staleTime: STALE_TIME.STANDARD,
  })
}

export function useThreadMembers(threadId: string | undefined) {
  return useQuery({
    queryKey: projectThreadKeys.members(threadId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_thread_members')
        .select('participant_id')
        .eq('thread_id', threadId!)
      if (error) throw error
      return new Set((data ?? []).map((m) => m.participant_id))
    },
    enabled: !!threadId,
    staleTime: STALE_TIME.SHORT,
  })
}

/** Email suggestions from workspace participants + previously used emails */
export function useEmailSuggestions(workspaceId: string | undefined) {
  return useQuery({
    queryKey: chatSettingsKeys.emailSuggestions(workspaceId),
    queryFn: async () => {
      // 1. Emails from workspace participants (clients, external staff)
      const { data: participants } = await supabase
        .from('participants')
        .select('email, name, last_name')
        .eq('workspace_id', workspaceId!)
        .eq('is_deleted', false)
        .not('email', 'is', null)

      // 2. Previously used contact emails with frequency count.
      // INNER JOIN на project_threads сразу фильтрует по workspace_id —
      // не нужно тянуть тысячи thread_id в URL (раньше упирались в лимит
      // длины URL у PostgREST → 400).
      const emailFrequency = new Map<string, number>()
      const { data } = await supabase
        .from('project_thread_email_links')
        .select('contact_email, project_threads!inner(workspace_id, is_deleted)')
        .eq('is_active', true)
        .eq('project_threads.workspace_id', workspaceId!)
        .eq('project_threads.is_deleted', false)
      for (const link of data ?? []) {
        const key = (link as { contact_email: string }).contact_email.toLowerCase()
        emailFrequency.set(key, (emailFrequency.get(key) ?? 0) + 1)
      }

      const map = new Map<string, { email: string; label: string; freq: number }>()

      for (const p of participants ?? []) {
        if (p.email && !p.email.endsWith('@telegram.placeholder')) {
          const key = p.email.toLowerCase()
          const fullName = [p.name, p.last_name].filter(Boolean).join(' ')
          map.set(key, {
            email: p.email,
            label: fullName || p.email,
            freq: emailFrequency.get(key) ?? 0,
          })
        }
      }

      for (const [key, freq] of emailFrequency) {
        if (!map.has(key) && !key.endsWith('@telegram.placeholder')) {
          map.set(key, { email: key, label: key, freq })
        }
      }

      return Array.from(map.values()).sort((a, b) => {
        if (a.freq !== b.freq) return b.freq - a.freq
        return a.label.localeCompare(b.label)
      })
    },
    enabled: !!workspaceId,
    staleTime: STALE_TIME.MEDIUM,
  })
}
