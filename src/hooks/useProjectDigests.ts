"use client"

/**
 * Дневник проекта — хуки React Query.
 *
 * Чтение:
 *  - useProjectDigests(projectId)                 — лента карточек дневника одного проекта
 *  - useWorkspaceDigestsForDate(wsId, date)       — карточки всех проектов воркспейса за конкретную дату
 *  - useProjectsWithActivity(wsId, start, end)    — список проектов с активностью за период (для пакетного прогона)
 *
 * Мутации:
 *  - useGenerateProjectDigest()                   — сгенерировать/обновить карточку (через edge function)
 *  - useDeleteProjectDigest()                     — удалить карточку
 *
 * Edge function: generate-project-digest. Сама решает, нужен ли LLM или хватит auto-list.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  GC_TIME,
  STALE_TIME,
  projectDigestKeys,
  projectsWithActivityKeys,
} from '@/hooks/queryKeys'
import type { Database } from '@/types/database'

export type ProjectDigest = Database['public']['Tables']['project_digests']['Row']

export interface ProjectWithActivity {
  project_id: string
  project_name: string
  events_count: number
  has_digest: boolean
}

/**
 * Возвращает YYYY-MM-DD для "сегодня" в Europe/Madrid.
 * Используется и фронтом, и edge function — границы должны совпадать.
 */
export function todayInMadrid(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Даёт UTC-границы [gte, lt) для дня (по Мадриду). */
export function madridDayRangeUtc(date: string): { gte: string; lt: string } {
  const start = new Date(`${date}T00:00:00`)
  // We compute Madrid offset by formatting "as if UTC" and seeing what shifts.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const utcCandidate = new Date(`${date}T00:00:00Z`)
  const parts = fmt.formatToParts(utcCandidate)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  const madridShown = new Date(
    `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`,
  )
  const offsetMs = madridShown.getTime() - utcCandidate.getTime()
  const gte = new Date(start.getTime() - offsetMs).toISOString()
  const lt = new Date(start.getTime() - offsetMs + 24 * 60 * 60 * 1000).toISOString()
  return { gte, lt }
}

// ── Чтение ──

export function useProjectDigests(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? projectDigestKeys.byProject(projectId) : ['project-digests', 'noop'],
    enabled: Boolean(projectId),
    staleTime: STALE_TIME.STANDARD,
    gcTime: GC_TIME.STANDARD,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_digests')
        .select('*')
        .eq('project_id', projectId!)
        .order('period_start', { ascending: false })
      if (error) throw error
      return (data ?? []) as ProjectDigest[]
    },
  })
}

export function useWorkspaceDigestsForDate(workspaceId: string | undefined, date: string) {
  return useQuery({
    queryKey: workspaceId
      ? projectDigestKeys.byWorkspaceForDate(workspaceId, date)
      : ['project-digests', 'noop'],
    enabled: Boolean(workspaceId && date),
    staleTime: STALE_TIME.SHORT,
    gcTime: GC_TIME.STANDARD,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_digests')
        .select('*, project:projects(id, name)')
        .eq('workspace_id', workspaceId!)
        .eq('period_start', date)
        .eq('period_end', date)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as Array<ProjectDigest & { project: { id: string; name: string } | null }>
    },
  })
}

export function useProjectsWithActivity(
  workspaceId: string | undefined,
  periodStart: string,
  periodEnd: string,
  enabled = true,
) {
  return useQuery({
    queryKey: workspaceId
      ? projectsWithActivityKeys.byWorkspaceForPeriod(workspaceId, periodStart, periodEnd)
      : ['projects-with-activity', 'noop'],
    enabled: Boolean(workspaceId) && enabled,
    staleTime: STALE_TIME.SHORT,
    gcTime: GC_TIME.STANDARD,
    queryFn: async () => {
      // Считаем границы в UTC из локальной даты (Мадрид).
      const startRange = madridDayRangeUtc(periodStart)
      const endRange = madridDayRangeUtc(periodEnd)
      const { data, error } = await supabase.rpc('get_projects_with_activity', {
        p_workspace_id: workspaceId!,
        p_period_start: startRange.gte,
        p_period_end: endRange.lt,
      })
      if (error) throw error
      return (data ?? []) as ProjectWithActivity[]
    },
  })
}

// ── Мутации ──

export interface GenerateDigestParams {
  workspaceId: string
  projectId: string
  periodStart?: string
  periodEnd?: string
  digestType?: 'day' | 'week' | 'month' | 'custom'
  force?: boolean
  testRun?: boolean
  overridePrompt?: string
}

export interface GenerateDigestResult {
  digest: ProjectDigest | null
  reused?: boolean
  test_run?: boolean
  skipped_reason?: string
}

async function callGenerateDigest(params: GenerateDigestParams): Promise<GenerateDigestResult> {
  const { data, error } = await supabase.functions.invoke('generate-project-digest', {
    body: {
      workspace_id: params.workspaceId,
      project_id: params.projectId,
      period_start: params.periodStart,
      period_end: params.periodEnd,
      digest_type: params.digestType ?? 'day',
      force: params.force,
      test_run: params.testRun,
      override_prompt: params.overridePrompt,
    },
  })
  if (error) {
    const serverMessage =
      (data as { error?: string } | null)?.error ||
      (error.context instanceof Response
        ? await (error.context as Response).json().then((j: { error?: string }) => j.error).catch(() => null)
        : null)
    throw new Error(serverMessage || error.message)
  }
  if ((data as { error?: string } | null)?.error) {
    throw new Error((data as { error: string }).error)
  }
  return data as GenerateDigestResult
}

export function useGenerateProjectDigest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: callGenerateDigest,
    onSuccess: (result, vars) => {
      if (vars.testRun) return // не трогаем кэш
      // Инвалидируем ленту проекта и срез по дате воркспейса.
      queryClient.invalidateQueries({
        queryKey: projectDigestKeys.byProject(vars.projectId),
      })
      const date = vars.periodStart ?? result.digest?.period_start
      if (date) {
        queryClient.invalidateQueries({
          queryKey: projectDigestKeys.byWorkspaceForDate(vars.workspaceId, date),
        })
      }
      // has_digest флаг в списке проектов с активностью — тоже мог измениться.
      queryClient.invalidateQueries({
        queryKey: ['projects-with-activity', vars.workspaceId],
      })
    },
  })
}

export function useDeleteProjectDigest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      digestId,
    }: {
      digestId: string
      projectId: string
      workspaceId: string
      periodStart: string
    }) => {
      const { error } = await supabase
        .from('project_digests')
        .delete()
        .eq('id', digestId)
      if (error) throw error
    },
    onSuccess: (_v, vars) => {
      queryClient.invalidateQueries({
        queryKey: projectDigestKeys.byProject(vars.projectId),
      })
      queryClient.invalidateQueries({
        queryKey: projectDigestKeys.byWorkspaceForDate(vars.workspaceId, vars.periodStart),
      })
      queryClient.invalidateQueries({
        queryKey: ['projects-with-activity', vars.workspaceId],
      })
    },
  })
}
