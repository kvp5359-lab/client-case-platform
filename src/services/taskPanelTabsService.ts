/**
 * Data layer для task_panel_tabs.
 *
 * Вынесено из useTaskPanelTabs, чтобы хук стал тоньше, а ручной upsert
 * (костыль вокруг partial unique — см. gotchas.md) был изолирован в одном
 * месте. Long-term TODO — заменить ручной SELECT+UPDATE/INSERT на RPC.
 */

import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import type { TaskPanelTab } from '@/components/tasks/taskPanelTabs.types'

export type TaskPanelScopeKind = 'project' | 'contact' | 'knowledge'

const SCOPE_COLUMN: Record<TaskPanelScopeKind, 'project_id' | 'contact_participant_id' | 'workspace_id'> = {
  project: 'project_id',
  contact: 'contact_participant_id',
  knowledge: 'workspace_id',
}

export type TaskPanelPersistedRow = {
  tabs: TaskPanelTab[]
  active_tab_id: string | null
  /** true если строки для пары user/scope в БД ещё нет. */
  isNew?: boolean
}

type FetchParams = {
  scopeKind: TaskPanelScopeKind
  scopeId: string
  userId: string
}

/**
 * Загружает строку task_panel_tabs + фильтрует мёртвые вкладки-треды
 * (где сам тред уже soft-deleted или удалён физически).
 */
export async function fetchTaskPanelTabs(
  params: FetchParams,
): Promise<TaskPanelPersistedRow> {
  const { scopeKind, scopeId, userId } = params
  const scopeColumn = SCOPE_COLUMN[scopeKind]

  const { data, error } = await supabase
    .from('task_panel_tabs')
    .select('tabs, active_tab_id')
    .eq(scopeColumn, scopeId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return { tabs: [], active_tab_id: null, isNew: true }

  const rawTabs: TaskPanelTab[] = Array.isArray(data.tabs)
    ? (data.tabs as unknown as TaskPanelTab[])
    : []

  // Отфильтровываем вкладки-треды с уже удалёнными тредами.
  const threadRefIds = rawTabs
    .filter((t) => t.type === 'thread' && t.refId)
    .map((t) => t.refId as string)

  let aliveThreadIds = new Set<string>()
  if (threadRefIds.length > 0) {
    const { data: alive, error: threadsErr } = await supabase
      .from('project_threads')
      .select('id')
      .in('id', threadRefIds)
      .eq('is_deleted', false)
    if (threadsErr) throw threadsErr
    aliveThreadIds = new Set((alive ?? []).map((r) => r.id))
  }

  const tabs = rawTabs.filter(
    (t) => t.type !== 'thread' || (t.refId && aliveThreadIds.has(t.refId)),
  )

  return {
    tabs,
    active_tab_id: data.active_tab_id ?? null,
    isNew: false,
  }
}

type UpsertParams = {
  scopeKind: TaskPanelScopeKind
  scopeId: string
  userId: string
  tabs: TaskPanelTab[]
  activeTabId: string | null
}

/**
 * Ручной upsert вокруг partial unique. PostgREST `.upsert({ onConflict })`
 * с partial unique отдаёт 42P10 — см. gotchas.md.
 *
 * Алгоритм: SELECT id по scope → UPDATE по id, либо INSERT.
 * Все «чужие» scope-колонки должны быть NULL — это требование CHECK
 * constraint'а и условие partial unique индексов.
 */
export async function upsertTaskPanelTabs(params: UpsertParams): Promise<void> {
  const { scopeKind, scopeId, userId, tabs, activeTabId } = params
  const scopeColumn = SCOPE_COLUMN[scopeKind]
  const otherColumns = (['project_id', 'contact_participant_id', 'workspace_id'] as const)
    .filter((c) => c !== scopeColumn)

  let selectQuery = supabase
    .from('task_panel_tabs')
    .select('id')
    .eq('user_id', userId)
    .eq(scopeColumn, scopeId)
  for (const col of otherColumns) selectQuery = selectQuery.is(col, null)

  const { data: existing, error: selErr } = await selectQuery.maybeSingle()
  if (selErr) throw selErr

  const payload = {
    tabs: tabs as unknown as Database['public']['Tables']['task_panel_tabs']['Update']['tabs'],
    active_tab_id: activeTabId,
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    const { error } = await supabase
      .from('task_panel_tabs')
      .update(payload)
      .eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('task_panel_tabs').insert({
      user_id: userId,
      project_id: scopeKind === 'project' ? scopeId : null,
      contact_participant_id: scopeKind === 'contact' ? scopeId : null,
      workspace_id: scopeKind === 'knowledge' ? scopeId : null,
      ...payload,
    })
    if (error) throw error
  }
}
