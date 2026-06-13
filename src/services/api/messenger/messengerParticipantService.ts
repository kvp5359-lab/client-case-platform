/**
 * Participant-lookup functions for messenger.
 * Extracted from messengerService.ts to reduce file size.
 */

import { supabase } from '@/lib/supabase'

/**
 * Get current user's participant_id in project
 */
export async function getCurrentProjectParticipant(
  projectId: string,
  userId: string,
): Promise<{
  participantId: string
  name: string
  role: string | null
} | null> {
  const { data } = await supabase
    .from('project_participants')
    .select(
      `
      participant_id,
      project_roles,
      participants!inner(id, name, last_name, user_id)
    `,
    )
    .eq('project_id', projectId)
    .eq('participants.user_id', userId)
    .maybeSingle()

  if (!data) return null

  const p = data.participants as { id: string; name: string; last_name: string | null }
  const roles = data.project_roles as string[] | null
  const roleName = roles?.[0] ?? null

  return {
    participantId: p.id,
    name: [p.name, p.last_name].filter(Boolean).join(' '),
    role: roleName,
  }
}

/**
 * Get current user's participant_id in workspace (for tasks without project)
 */
export async function getCurrentWorkspaceParticipant(
  workspaceId: string,
  userId: string,
): Promise<{
  participantId: string
  name: string
  role: string | null
} | null> {
  const { data } = await supabase
    .from('participants')
    .select('id, name, last_name, workspace_roles')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (!data) return null

  const roles = data.workspace_roles as string[] | null
  const roleName = roles?.[0] ?? null

  return {
    participantId: data.id,
    name: [data.name, data.last_name].filter(Boolean).join(' '),
    role: roleName,
  }
}

/** Participant либо в проекте, либо в воркспейсе. */
export type ResolvedParticipant = {
  participantId: string
  name: string
  role: string | null
}

/**
 * Резолв «моей личности» в треде (каскад):
 *   1. Если есть projectId — пробуем project-level participant.
 *   2. Если в проекте записи нет (owner/менеджер с доступом по праву
 *      владельца/роли БЕЗ строки в project_participants) ИЛИ projectId нет —
 *      падаем на workspace-level participant. Он валиден везде
 *      (message_reactions.participant_id и пр. ссылаются на participants).
 *
 * Каскад (а не XOR project/workspace) — это и есть фикс owner-не-участника
 * из ledger 2026-06-12 (без фоллбэка ломались реакции/отправка/mark-read/
 * «своё»). Раньше логика дублировалась инлайн в 5+ messenger-хуках, причём
 * часть из них была XOR-вариантом с латентной дырой; единый источник.
 */
export async function resolveParticipantFull(
  projectId: string | undefined,
  workspaceId: string | undefined,
  userId: string,
): Promise<ResolvedParticipant | null> {
  if (projectId) {
    const inProject = await getCurrentProjectParticipant(projectId, userId)
    if (inProject) return inProject
  }
  if (workspaceId) {
    return await getCurrentWorkspaceParticipant(workspaceId, userId)
  }
  return null
}

/** То же, но возвращает только participantId (или null). */
export async function resolveParticipantId(
  projectId: string | undefined,
  workspaceId: string | undefined,
  userId: string,
): Promise<string | null> {
  return (await resolveParticipantFull(projectId, workspaceId, userId))?.participantId ?? null
}
