/**
 * Сервис системы отчётов: CRUD report_definitions + запуск run_report +
 * загрузка вариантов значений для фильтров (справочники по optionsKind).
 *
 * Права резолвит RLS (см. миграцию 20260704130000_report_definitions.sql):
 * общие отчёты (owner_user_id NULL) меняют менеджеры, личные — владелец.
 */

import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'
import type {
  ReportConfig,
  ReportDefinition,
  ReportRunResult,
} from '@/types/reports'
import type { ReportOptionsKind } from '@/lib/reports/registry'

type RawReportRow = Omit<ReportDefinition, 'config'> & { config: unknown }

function fromRow(row: RawReportRow): ReportDefinition {
  return { ...row, config: (row.config ?? {}) as ReportConfig }
}

const REPORT_SELECT =
  'id, workspace_id, owner_user_id, name, description, config, created_by, created_at, updated_at'

export async function getReports(workspaceId: string): Promise<ReportDefinition[]> {
  const { data, error } = await supabase
    .from('report_definitions')
    .select(REPORT_SELECT)
    .eq('workspace_id', workspaceId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => fromRow(r as RawReportRow))
}

export async function getReportById(reportId: string): Promise<ReportDefinition | null> {
  const { data, error } = await supabase
    .from('report_definitions')
    .select(REPORT_SELECT)
    .eq('id', reportId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (error) throw error
  return data ? fromRow(data as RawReportRow) : null
}

export type CreateReportParams = {
  workspaceId: string
  name: string
  config: ReportConfig
  /** true → личный отчёт текущего юзера, false → общий воркспейса. */
  personal: boolean
  description?: string | null
}

export async function createReport(params: CreateReportParams): Promise<ReportDefinition> {
  const { data: userRes, error: userErr } = await supabase.auth.getUser()
  if (userErr) throw userErr
  const userId = userRes.user?.id
  if (!userId) throw new Error('Нет авторизованного пользователя')

  const { data, error } = await supabase
    .from('report_definitions')
    .insert({
      workspace_id: params.workspaceId,
      owner_user_id: params.personal ? userId : null,
      name: params.name.trim(),
      description: params.description ?? null,
      config: params.config as unknown as Json,
      created_by: userId,
    })
    .select(REPORT_SELECT)
    .single()
  if (error) throw error
  return fromRow(data as RawReportRow)
}

export type UpdateReportParams = {
  reportId: string
  name?: string
  description?: string | null
  config?: ReportConfig
}

export async function updateReport(params: UpdateReportParams): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (params.name !== undefined) patch.name = params.name.trim()
  if (params.description !== undefined) patch.description = params.description
  if (params.config !== undefined) patch.config = params.config as unknown as Json
  const { error } = await supabase
    .from('report_definitions')
    .update(patch)
    .eq('id', params.reportId)
  if (error) throw error
}

export async function softDeleteReport(reportId: string): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('report_definitions')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: userRes.user?.id ?? null,
    })
    .eq('id', reportId)
  if (error) throw error
}

// ── Запуск ────────────────────────────────────────────────

export async function runReport(
  workspaceId: string,
  config: ReportConfig,
): Promise<ReportRunResult> {
  const { data, error } = await supabase.rpc('run_report', {
    p_workspace_id: workspaceId,
    p_config: config as unknown as Json,
  })
  if (error) throw error
  const result = data as unknown as ReportRunResult | null
  return {
    rows: result?.rows ?? [],
    totals: result?.totals ?? null,
    rowCount: result?.rowCount ?? 0,
    limitHit: result?.limitHit ?? false,
  }
}

// ── Варианты значений для фильтров ────────────────────────

export type ReportFieldOption = { value: string; label: string }

export async function getReportFieldOptions(
  workspaceId: string,
  kind: ReportOptionsKind,
): Promise<ReportFieldOption[]> {
  switch (kind) {
    case 'participants': {
      const { data, error } = await supabase
        .from('participants')
        .select('id, name, last_name')
        .eq('workspace_id', workspaceId)
        .eq('is_deleted', false)
        .order('name')
      if (error) throw error
      return (data ?? []).map((p) => ({
        value: p.id,
        label: [p.name, p.last_name].filter(Boolean).join(' ').trim() || '—',
      }))
    }
    case 'projects': {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .eq('is_deleted', false)
        .order('last_activity_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((p) => ({ value: p.id, label: p.name }))
    }
    case 'txCategories': {
      const { data, error } = await supabase
        .from('finance_transaction_categories')
        .select('id, name, kind')
        .eq('workspace_id', workspaceId)
        .eq('is_deleted', false)
        .order('name')
      if (error) throw error
      return (data ?? []).map((c) => ({
        value: c.id,
        label: `${c.name} (${c.kind === 'income' ? 'доход' : 'расход'})`,
      }))
    }
    case 'projectStatuses':
    case 'threadStatuses': {
      const { data, error } = await supabase
        .from('statuses')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .eq('entity_type', kind === 'projectStatuses' ? 'project' : 'task')
        .order('order_index')
      if (error) throw error
      return (data ?? []).map((s) => ({ value: s.id, label: s.name }))
    }
    case 'templates': {
      const { data, error } = await supabase
        .from('project_templates')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .order('name')
      if (error) throw error
      return (data ?? []).map((t) => ({ value: t.id, label: t.name }))
    }
    case 'financeServices': {
      const { data, error } = await supabase
        .from('finance_services')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .eq('is_deleted', false)
        .order('name')
      if (error) throw error
      return (data ?? []).map((s) => ({ value: s.id, label: s.name }))
    }
    default:
      return []
  }
}
