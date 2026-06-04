/**
 * Пакетные операции с исполнителями проектов для item_lists.
 *
 * Исполнитель = участник проекта (`project_participants`) с ролью
 * `Исполнитель` в массиве `project_roles`. Логика повторяет
 * `applyRoleParticipantsChange` из useProjectParticipantsMutations, но
 * работает сразу по нескольким проектам.
 */

import { supabase } from '@/lib/supabase'
import { SYSTEM_PROJECT_ROLES } from '@/types/permissions'

const EXECUTOR = SYSTEM_PROJECT_ROLES.EXECUTOR // 'Исполнитель'

type Row = {
  id: string
  project_id: string
  participant_id: string
  project_roles: string[]
}

async function loadRows(projectIds: string[]): Promise<Row[]> {
  const { data, error } = await supabase
    .from('project_participants')
    .select('id, project_id, participant_id, project_roles')
    .in('project_id', projectIds)
  if (error) throw error
  return (data ?? []) as Row[]
}

export type ExecutorOption = {
  participantId: string
  name: string
  /** В скольких из выделенных проектов этот участник — исполнитель. */
  projectCount: number
}

/** Объединение исполнителей по всем выделенным проектам — для выбора кого отстранить. */
export async function loadExecutorsOfProjects(projectIds: string[]): Promise<ExecutorOption[]> {
  const rows = (await loadRows(projectIds)).filter((r) => r.project_roles?.includes(EXECUTOR))
  const ids = [...new Set(rows.map((r) => r.participant_id))]
  if (ids.length === 0) return []

  const { data: parts, error } = await supabase
    .from('participants')
    .select('id, name, last_name')
    .in('id', ids)
  if (error) throw error

  const nameById = new Map(
    (parts ?? []).map((p) => [p.id, [p.name, p.last_name].filter(Boolean).join(' ') || '—']),
  )
  const countById = new Map<string, number>()
  for (const r of rows) countById.set(r.participant_id, (countById.get(r.participant_id) ?? 0) + 1)

  return ids
    .map((id) => ({
      participantId: id,
      name: nameById.get(id) ?? '—',
      projectCount: countById.get(id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

/** Добавить роль «Исполнитель» каждому из participantIds во всех projectIds. */
export async function addExecutors(projectIds: string[], participantIds: string[]) {
  const rows = await loadRows(projectIds)
  const byKey = new Map(rows.map((r) => [`${r.project_id}:${r.participant_id}`, r]))

  for (const projectId of projectIds) {
    for (const participantId of participantIds) {
      const existing = byKey.get(`${projectId}:${participantId}`)
      if (existing) {
        if (existing.project_roles?.includes(EXECUTOR)) continue
        const { error } = await supabase
          .from('project_participants')
          .update({ project_roles: [...(existing.project_roles ?? []), EXECUTOR] })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('project_participants').insert({
          project_id: projectId,
          participant_id: participantId,
          project_roles: [EXECUTOR],
        })
        if (error) throw error
      }
    }
  }
}

/**
 * Снять роль «Исполнитель» с переданных строк. Если других ролей у участника
 * в проекте не остаётся — удаляем строку целиком.
 */
async function stripExecutorFrom(rows: Row[]) {
  for (const r of rows) {
    if (!r.project_roles?.includes(EXECUTOR)) continue
    const newRoles = r.project_roles.filter((x) => x !== EXECUTOR)
    if (newRoles.length === 0) {
      const { error } = await supabase.from('project_participants').delete().eq('id', r.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('project_participants')
        .update({ project_roles: newRoles })
        .eq('id', r.id)
      if (error) throw error
    }
  }
}

/** Отстранить конкретного исполнителя из всех выделенных проектов. */
export async function removeExecutor(projectIds: string[], participantId: string) {
  const rows = await loadRows(projectIds)
  await stripExecutorFrom(rows.filter((r) => r.participant_id === participantId))
}

/** Отстранить всех исполнителей во всех выделенных проектах. */
export async function removeAllExecutors(projectIds: string[]) {
  const rows = await loadRows(projectIds)
  await stripExecutorFrom(rows)
}
