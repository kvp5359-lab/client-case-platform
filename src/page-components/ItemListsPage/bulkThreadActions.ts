/**
 * Пакетные операции с тредами для item_lists: исполнители (task_assignees),
 * участники-зрители (project_thread_members) и срок (project_threads.deadline).
 *
 * Исполнитель ≠ участник: исполнитель — назначенный на задачу (task_assignees),
 * участник — у кого есть доступ к просмотру треда (project_thread_members).
 * Снятие участника закрывает доступ к переписке.
 */

import { supabase } from '@/lib/supabase'

export type PeopleOption = {
  participantId: string
  name: string
  /** В скольких из выделенных тредов присутствует. */
  count: number
}

async function resolveNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase
    .from('participants')
    .select('id, name, last_name')
    .in('id', ids)
  if (error) throw error
  return new Map(
    (data ?? []).map((p) => [p.id, [p.name, p.last_name].filter(Boolean).join(' ') || '—']),
  )
}

function toOptions(rows: { participant_id: string }[], names: Map<string, string>): PeopleOption[] {
  const countById = new Map<string, number>()
  for (const r of rows) countById.set(r.participant_id, (countById.get(r.participant_id) ?? 0) + 1)
  return [...countById.keys()]
    .map((id) => ({ participantId: id, name: names.get(id) ?? '—', count: countById.get(id) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

// ── Исполнители (task_assignees) ──────────────────────────────────────────

export async function addThreadAssignees(threadIds: string[], participantIds: string[]) {
  // Существующие связки, чтобы не плодить дубли (PK по (thread_id,participant_id)
  // тоже защищает, но молча пропустим уже назначенных).
  const { data: existing, error: exErr } = await supabase
    .from('task_assignees')
    .select('thread_id, participant_id')
    .in('thread_id', threadIds)
  if (exErr) throw exErr
  const has = new Set((existing ?? []).map((r) => `${r.thread_id}:${r.participant_id}`))
  const rows: { thread_id: string; participant_id: string }[] = []
  for (const t of threadIds) {
    for (const p of participantIds) {
      if (!has.has(`${t}:${p}`)) rows.push({ thread_id: t, participant_id: p })
    }
  }
  if (rows.length === 0) return
  const { error } = await supabase.from('task_assignees').insert(rows)
  if (error) throw error
}

export async function removeAllThreadAssignees(threadIds: string[]) {
  const { error } = await supabase.from('task_assignees').delete().in('thread_id', threadIds)
  if (error) throw error
}

export async function removeThreadAssignees(threadIds: string[], participantIds: string[]) {
  const { error } = await supabase
    .from('task_assignees')
    .delete()
    .in('thread_id', threadIds)
    .in('participant_id', participantIds)
  if (error) throw error
}

export async function loadAssigneesOfThreads(threadIds: string[]): Promise<PeopleOption[]> {
  const { data, error } = await supabase
    .from('task_assignees')
    .select('participant_id')
    .in('thread_id', threadIds)
  if (error) throw error
  const rows = data ?? []
  return toOptions(rows, await resolveNames([...new Set(rows.map((r) => r.participant_id))]))
}

// ── Участники-зрители (project_thread_members) ────────────────────────────

export async function removeThreadMembers(threadIds: string[], participantIds: string[]) {
  const { error } = await supabase
    .from('project_thread_members')
    .delete()
    .in('thread_id', threadIds)
    .in('participant_id', participantIds)
  if (error) throw error
}

export async function loadMembersOfThreads(threadIds: string[]): Promise<PeopleOption[]> {
  const { data, error } = await supabase
    .from('project_thread_members')
    .select('participant_id')
    .in('thread_id', threadIds)
  if (error) throw error
  const rows = data ?? []
  return toOptions(rows, await resolveNames([...new Set(rows.map((r) => r.participant_id))]))
}

// ── Срок ──────────────────────────────────────────────────────────────────

export async function setThreadsDeadline(threadIds: string[], deadline: string | null) {
  // start_at/end_at синхронизирует БД-триггер sync_thread_deadline_end_at.
  const { error } = await supabase
    .from('project_threads')
    .update({ deadline })
    .in('id', threadIds)
  if (error) throw error
}
