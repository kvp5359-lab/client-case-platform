import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'
import { projectKeys, trashKeys } from '@/hooks/queryKeys'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type {
  ProjectAssigneeOption,
  ProjectTemplateOption,
} from '@/components/projects/filters'
import type { WorkspacePermissionsResult } from '@/hooks/permissions/useWorkspacePermissions'

type Project = Tables<'projects'>

export interface ProjectParticipantsData {
  byProject: Record<string, string[]>
  byProjectGroups: Record<string, { role: string; participants: AvatarParticipant[] }[]>
  participants: ProjectAssigneeOption[]
}

export function useProjectsQuery(
  workspaceId: string | null | undefined,
  userId: string | undefined,
  permissions: WorkspacePermissionsResult,
) {
  return useQuery({
    queryKey: projectKeys.listForUser(
      workspaceId ?? '',
      userId,
      permissions.isOwner,
      permissions.can('view_all_projects'),
    ),
    queryFn: async () => {
      if (!workspaceId) return []
      const canViewAll = permissions.isOwner || permissions.can('view_all_projects')
      const { data, error } = await supabase.rpc('get_user_projects', {
        p_workspace_id: workspaceId,
        p_user_id: userId!,
        p_can_view_all: canViewAll,
      })
      if (error) throw error
      return (data || []) as Project[]
    },
    enabled: !!workspaceId && !permissions.isLoading,
  })
}

export function useProjectTemplatesQuery(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: ['project-templates', workspaceId ?? ''],
    queryFn: async (): Promise<ProjectTemplateOption[]> => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('project_templates')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .order('name')
      if (error) throw error
      return (data ?? []) as ProjectTemplateOption[]
    },
    enabled: !!workspaceId,
  })
}

export function useProjectParticipantsQuery(workspaceId: string | null | undefined) {
  return useQuery<ProjectParticipantsData>({
    queryKey: ['project-participants-filter', workspaceId ?? ''],
    queryFn: async () => {
      if (!workspaceId)
        return { byProject: {}, byProjectGroups: {}, participants: [] }

      const [{ data: pp, error: ppErr }, { data: roles, error: rolesErr }] = await Promise.all([
        supabase
          .from('project_participants')
          .select(
            'project_id, participant_id, project_roles, participants!inner(id, name, last_name, avatar_url, workspace_id, is_deleted)',
          )
          .eq('participants.workspace_id', workspaceId)
          .eq('participants.is_deleted', false),
        supabase
          .from('project_roles')
          .select('name, order_index')
          .eq('workspace_id', workspaceId)
          .order('order_index'),
      ])

      if (ppErr) throw ppErr
      if (rolesErr) throw rolesErr

      const roleOrder = (roles ?? []).map((r) => r.name as string)
      const byProject: Record<string, string[]> = {}
      const participantsMap = new Map<string, ProjectAssigneeOption>()
      const byProjectRole: Record<string, Map<string, AvatarParticipant[]>> = {}

      for (const row of pp ?? []) {
        const pid = row.participant_id as string
        const projId = row.project_id as string
        const projectRoles = (row.project_roles as string[] | null) ?? []
        ;(byProject[projId] ??= []).push(pid)

        const part = Array.isArray(row.participants) ? row.participants[0] : row.participants
        if (!part) continue

        if (!participantsMap.has(part.id)) {
          participantsMap.set(part.id, {
            id: part.id,
            name: part.name,
            last_name: part.last_name,
            avatar_url: part.avatar_url,
          })
        }

        const avatar: AvatarParticipant = {
          id: part.id,
          name: part.name ?? '?',
          last_name: part.last_name ?? null,
          avatar_url: part.avatar_url ?? null,
        }

        const projectMap = (byProjectRole[projId] ??= new Map())
        for (const role of projectRoles) {
          if (!projectMap.has(role)) projectMap.set(role, [])
          projectMap.get(role)!.push(avatar)
        }
      }

      const byProjectGroups: Record<string, { role: string; participants: AvatarParticipant[] }[]> = {}
      for (const [projId, projectMap] of Object.entries(byProjectRole)) {
        byProjectGroups[projId] = roleOrder
          .filter((role) => projectMap.has(role))
          .map((role) => ({ role, participants: projectMap.get(role)! }))
      }

      return { byProject, byProjectGroups, participants: Array.from(participantsMap.values()) }
    },
    enabled: !!workspaceId,
  })
}

export function useProjectsPageMutations(
  workspaceId: string | null | undefined,
  userId: string | undefined,
) {
  const queryClient = useQueryClient()

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase
        .from('projects')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: userId ?? null,
        })
        .eq('id', projectId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.byWorkspace(workspaceId ?? '') })
      queryClient.invalidateQueries({ queryKey: trashKeys.all })
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: async ({ projectId, statusId }: { projectId: string; statusId: string }) => {
      const { error } = await supabase
        .from('projects')
        .update({ status_id: statusId })
        .eq('id', projectId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.byWorkspace(workspaceId ?? '') })
    },
    onError: () => toast.error('Не удалось обновить статус'),
  })

  const toggleRoleParticipantMutation = useMutation({
    mutationFn: async ({
      projectId,
      participantId,
      roleName,
    }: {
      projectId: string
      participantId: string
      roleName: string
    }) => {
      const { data: existing, error: fetchErr } = await supabase
        .from('project_participants')
        .select('id, project_roles')
        .eq('project_id', projectId)
        .eq('participant_id', participantId)
        .maybeSingle()
      if (fetchErr) throw fetchErr

      if (!existing) {
        const { error } = await supabase.from('project_participants').insert({
          project_id: projectId,
          participant_id: participantId,
          project_roles: [roleName],
        })
        if (error) throw error
        return
      }

      const hasRole = existing.project_roles.includes(roleName)
      const newRoles = hasRole
        ? existing.project_roles.filter((r: string) => r !== roleName)
        : [...existing.project_roles, roleName]

      if (newRoles.length === 0) {
        const { error } = await supabase
          .from('project_participants')
          .delete()
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('project_participants')
          .update({ project_roles: newRoles })
          .eq('id', existing.id)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['project-participants-filter', workspaceId ?? ''],
      })
    },
    onError: () => toast.error('Не удалось обновить участников'),
  })

  return { deleteProjectMutation, updateStatusMutation, toggleRoleParticipantMutation }
}
