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
