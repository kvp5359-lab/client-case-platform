'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Answers } from '@/lib/residence/ruleEvaluator'

export type CaseProfile = {
  id: string
  project_id: string
  workspace_id: string
  country_id: string | null
  selected_residence_type_ids: string[]
  answers: Answers
  result_snapshot: unknown
  computed_at: string | null
}

const key = (projectId: string) => ['case-profile', projectId]

/** Профиль подбора ВНЖ проекта (один на проект). */
export function useCaseProfile(projectId: string) {
  return useQuery({
    queryKey: key(projectId),
    queryFn: async (): Promise<CaseProfile | null> => {
      const { data, error } = await supabase
        .from('case_profiles')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle()
      if (error) throw error
      return (data as CaseProfile | null) ?? null
    },
  })
}

export type SaveCaseProfileInput = {
  country_id: string | null
  answers: Answers
  selected_residence_type_ids?: string[]
  result_snapshot?: unknown
}

/** Сохранить (upsert по project_id) профиль подбора. */
export function useSaveCaseProfile(projectId: string, workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SaveCaseProfileInput) => {
      const { error } = await supabase.from('case_profiles').upsert(
        {
          project_id: projectId,
          workspace_id: workspaceId,
          country_id: input.country_id,
          answers: input.answers as never,
          selected_residence_type_ids: input.selected_residence_type_ids ?? [],
          result_snapshot: (input.result_snapshot ?? null) as never,
          computed_at: input.result_snapshot ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id' },
      )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  })
}
