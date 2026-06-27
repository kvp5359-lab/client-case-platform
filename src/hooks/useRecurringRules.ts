import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { recurringKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { RecurrenceFreq } from '@/lib/recurring/schedule'
import type { RecurringRule, RecurringRuleInput } from '@/types/recurring'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

type Row = Tables<'recurring_task_rules'>

function fromRow(r: Row): RecurringRule {
  return {
    id: r.id,
    workspace_id: r.workspace_id,
    project_id: r.project_id,
    created_by: r.created_by,
    owner_user_id: r.owner_user_id,
    title: r.title,
    description: r.description,
    accent_color: r.accent_color,
    icon: r.icon,
    status_id: r.status_id,
    access_type: r.access_type,
    access_roles: r.access_roles,
    assignee_participant_ids: r.assignee_participant_ids ?? [],
    member_participant_ids: r.member_participant_ids ?? [],
    initial_message_html: r.initial_message_html,
    source_template_id: r.source_template_id,
    freq: r.freq as RecurrenceFreq,
    byweekday: r.byweekday ?? [],
    bymonthday: r.bymonthday,
    fire_time: r.fire_time,
    end_time: r.end_time,
    timezone: r.timezone,
    create_lead_minutes: r.create_lead_minutes,
    starts_on: r.starts_on,
    until_date: r.until_date,
    is_active: r.is_active,
    occurrences_count: r.occurrences_count,
    next_occurrence_at: r.next_occurrence_at,
    last_run_at: r.last_run_at,
    is_deleted: r.is_deleted,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

export function useRecurringRules(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? recurringKeys.byWorkspace(workspaceId) : ['recurring-rules', 'noop'],
    enabled: !!workspaceId,
    staleTime: STALE_TIME.STANDARD,
    queryFn: async (): Promise<RecurringRule[]> => {
      const { data, error } = await supabase
        .from('recurring_task_rules')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r) => fromRow(r as Row))
    },
  })
}

export function useCreateRecurringRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: RecurringRuleInput): Promise<RecurringRule> => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser()
      if (userErr) throw userErr
      const userId = userRes.user?.id
      if (!userId) throw new Error('Нет авторизованного пользователя')

      const payload: TablesInsert<'recurring_task_rules'> = {
        workspace_id: input.workspace_id,
        project_id: input.project_id ?? null,
        owner_user_id: input.owner_user_id ?? null,
        created_by: userId,
        title: input.title.trim(),
        description: input.description ?? null,
        accent_color: input.accent_color ?? 'blue',
        icon: input.icon ?? 'message-square',
        status_id: input.status_id ?? null,
        access_type: input.access_type ?? 'all',
        access_roles: input.access_roles ?? [],
        assignee_participant_ids: input.assignee_participant_ids ?? [],
        member_participant_ids: input.member_participant_ids ?? [],
        source_template_id: input.source_template_id ?? null,
        freq: input.freq,
        byweekday: input.byweekday ?? [],
        bymonthday: input.bymonthday ?? null,
        fire_time: input.fire_time ?? '09:00',
        end_time: input.end_time ?? null,
        timezone: input.timezone ?? 'Europe/Madrid',
        create_lead_minutes: input.create_lead_minutes ?? 0,
        starts_on: input.starts_on ?? null,
        until_date: input.until_date ?? null,
      }

      const { data, error } = await supabase
        .from('recurring_task_rules')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      return fromRow(data as Row)
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: recurringKeys.byWorkspace(created.workspace_id) })
    },
  })
}

export function useUpdateRecurringRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      params: { id: string; workspace_id: string } & Partial<RecurringRuleInput>,
    ): Promise<RecurringRule> => {
      const { id, workspace_id: _ws, ...rest } = params
      const patch: TablesUpdate<'recurring_task_rules'> = {}
      // переносим только переданные поля
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined) (patch as Record<string, unknown>)[k] = v
      }
      const { data, error } = await supabase
        .from('recurring_task_rules')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return fromRow(data as Row)
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: recurringKeys.byWorkspace(updated.workspace_id) })
      qc.invalidateQueries({ queryKey: recurringKeys.byId(updated.id) })
    },
  })
}

export function useToggleRecurringRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id: string
      workspace_id: string
      is_active: boolean
    }): Promise<RecurringRule> => {
      const { data, error } = await supabase
        .from('recurring_task_rules')
        .update({ is_active: params.is_active })
        .eq('id', params.id)
        .select()
        .single()
      if (error) throw error
      return fromRow(data as Row)
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: recurringKeys.byWorkspace(updated.workspace_id) })
    },
  })
}

export function useDeleteRecurringRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; workspace_id: string }): Promise<void> => {
      const { data: userRes } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('recurring_task_rules')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: userRes.user?.id ?? null,
          is_active: false,
        })
        .eq('id', params.id)
      if (error) throw error
    },
    onSuccess: (_data, params) => {
      qc.invalidateQueries({ queryKey: recurringKeys.byWorkspace(params.workspace_id) })
    },
  })
}
