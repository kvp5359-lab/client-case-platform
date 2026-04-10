"use client"

/**
 * useTrash — хуки для раздела «Корзина» в настройках воркспейса.
 *
 * В корзине лежат мягко удалённые проекты и треды (задачи, чаты, email).
 * Доступ к разделу — только владелец воркспейса (проверяется на уровне UI).
 *
 * Возможности:
 *  - прочитать содержимое корзины (проекты + треды)
 *  - восстановить элемент (снять is_deleted)
 *  - удалить навсегда (физически из БД)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logAuditAction } from '@/services/auditService'
import { messengerKeys } from '@/hooks/queryKeys'

// ── Типы ──

export interface TrashedProject {
  id: string
  name: string
  description: string | null
  deleted_at: string | null
  deleted_by: string | null
  deleted_by_name: string | null
  created_at: string
}

export interface TrashedThread {
  id: string
  name: string
  type: 'chat' | 'task'
  project_id: string | null
  project_name: string | null
  deleted_at: string | null
  deleted_by: string | null
  deleted_by_name: string | null
  created_at: string
}

// ── Ключи кэша ──

export const trashKeys = {
  all: ['trash'] as const,
  workspace: (workspaceId: string) => [...trashKeys.all, workspaceId] as const,
  projects: (workspaceId: string) => [...trashKeys.workspace(workspaceId), 'projects'] as const,
  threads: (workspaceId: string) => [...trashKeys.workspace(workspaceId), 'threads'] as const,
}

// ── Чтение корзины ──

/**
 * Удалённые проекты воркспейса
 */
export function useTrashedProjects(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? trashKeys.projects(workspaceId) : ['trash', 'projects', 'none'],
    queryFn: async (): Promise<TrashedProject[]> => {
      if (!workspaceId) return []

      const { data, error } = await supabase
        .from('projects')
        .select('id, name, description, deleted_at, deleted_by, created_at')
        .eq('workspace_id', workspaceId)
        .eq('is_deleted', true)
        .order('deleted_at', { ascending: false, nullsFirst: false })

      if (error) throw error
      const rows = (data ?? []) as Array<{
        id: string
        name: string
        description: string | null
        deleted_at: string | null
        deleted_by: string | null
        created_at: string
      }>

      // Подтянем имена тех, кто удалил (через participants, по user_id)
      const userIds = Array.from(new Set(rows.map((r) => r.deleted_by).filter((v): v is string => !!v)))
      const nameByUser = await fetchParticipantNames(workspaceId, userIds)

      return rows.map((r) => ({
        ...r,
        deleted_by_name: r.deleted_by ? (nameByUser.get(r.deleted_by) ?? null) : null,
      }))
    },
    enabled: !!workspaceId,
    staleTime: 30_000,
  })
}

/**
 * Удалённые треды воркспейса (задачи, чаты, email)
 */
export function useTrashedThreads(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? trashKeys.threads(workspaceId) : ['trash', 'threads', 'none'],
    queryFn: async (): Promise<TrashedThread[]> => {
      if (!workspaceId) return []

      const { data, error } = await supabase
        .from('project_threads')
        .select('id, name, type, project_id, deleted_at, deleted_by, created_at, projects(name)')
        .eq('workspace_id', workspaceId)
        .eq('is_deleted', true)
        .order('deleted_at', { ascending: false, nullsFirst: false })

      if (error) throw error
      type Row = {
        id: string
        name: string
        type: 'chat' | 'task'
        project_id: string | null
        deleted_at: string | null
        deleted_by: string | null
        created_at: string
        projects: { name: string } | null
      }
      const rows = (data ?? []) as unknown as Row[]

      const userIds = Array.from(new Set(rows.map((r) => r.deleted_by).filter((v): v is string => !!v)))
      const nameByUser = await fetchParticipantNames(workspaceId, userIds)

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        project_id: r.project_id,
        project_name: r.projects?.name ?? null,
        deleted_at: r.deleted_at,
        deleted_by: r.deleted_by,
        deleted_by_name: r.deleted_by ? (nameByUser.get(r.deleted_by) ?? null) : null,
        created_at: r.created_at,
      }))
    },
    enabled: !!workspaceId,
    staleTime: 30_000,
  })
}

/**
 * Вспомогательный запрос: ищем имена участников по user_id в рамках воркспейса.
 */
async function fetchParticipantNames(
  workspaceId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (userIds.length === 0) return map

  const { data } = await supabase
    .from('participants')
    .select('user_id, name, last_name')
    .eq('workspace_id', workspaceId)
    .in('user_id', userIds)

  for (const p of data ?? []) {
    const row = p as { user_id: string; name: string; last_name: string | null }
    if (!row.user_id) continue
    const full = [row.name, row.last_name].filter(Boolean).join(' ').trim()
    if (full) map.set(row.user_id, full)
  }
  return map
}

// ── Восстановление ──

/**
 * Восстановить проект из корзины (снять is_deleted)
 */
export function useRestoreProject(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (project: { id: string; name: string }) => {
      const { error } = await supabase
        .from('projects')
        .update({ is_deleted: false, deleted_at: null, deleted_by: null })
        .eq('id', project.id)
      if (error) throw error

      logAuditAction('restore', 'project', project.id, { name: project.name })
      return project
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trashKeys.workspace(workspaceId) })
      queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['sidebar', 'projects', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['boards', 'projects', workspaceId] })
    },
  })
}

/**
 * Восстановить тред из корзины
 */
export function useRestoreThread(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (thread: {
      id: string
      name: string
      type: 'chat' | 'task'
      project_id: string | null
    }) => {
      const { error } = await supabase
        .from('project_threads')
        .update({ is_deleted: false, deleted_at: null, deleted_by: null })
        .eq('id', thread.id)
      if (error) throw error

      const resourceType = thread.type === 'task' ? ('task' as const) : ('thread' as const)
      logAuditAction('restore', resourceType, thread.id, {
        name: thread.name,
        type: thread.type,
      }, thread.project_id ?? undefined)

      return thread
    },
    onSuccess: (thread) => {
      queryClient.invalidateQueries({ queryKey: trashKeys.workspace(workspaceId) })
      if (thread.project_id) {
        queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads(thread.project_id) })
      }
      queryClient.invalidateQueries({ queryKey: ['workspace-tasks', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['my-urgent-tasks-count', workspaceId] })
    },
  })
}

// ── Окончательное удаление ──

/**
 * Удалить проект навсегда (физически из БД).
 * Треды, документы и прочее каскадно удалятся через FK-констрейнты БД.
 */
export function useHardDeleteProject(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (project: { id: string; name: string }) => {
      const { error } = await supabase.from('projects').delete().eq('id', project.id)
      if (error) throw error

      logAuditAction('hard_delete', 'project', project.id, { name: project.name })
      return project
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trashKeys.workspace(workspaceId) })
    },
  })
}

/**
 * Удалить тред навсегда (физически из БД).
 */
export function useHardDeleteThread(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (thread: {
      id: string
      name: string
      type: 'chat' | 'task'
      project_id: string | null
    }) => {
      const { error } = await supabase.from('project_threads').delete().eq('id', thread.id)
      if (error) throw error

      const resourceType = thread.type === 'task' ? ('task' as const) : ('thread' as const)
      logAuditAction('hard_delete', resourceType, thread.id, {
        name: thread.name,
        type: thread.type,
      }, thread.project_id ?? undefined)

      return thread
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trashKeys.workspace(workspaceId) })
    },
  })
}
