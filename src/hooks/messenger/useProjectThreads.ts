"use client"

/**
 * Хук для работы с тредами проекта (project_threads)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { messengerKeys } from '@/hooks/queryKeys'
import type { MessageChannel } from '@/services/api/messengerService'

export type ThreadAccentColor =
  | 'blue'
  | 'slate'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'violet'
  | 'orange'
  | 'cyan'
  | 'pink'
  | 'indigo'

export interface ProjectThread {
  id: string
  project_id: string | null
  workspace_id: string
  name: string
  type: 'chat' | 'task'
  access_type: 'all' | 'roles' | 'custom'
  access_roles: string[]
  legacy_channel: MessageChannel | null
  is_default: boolean
  sort_order: number
  accent_color: ThreadAccentColor
  icon: string
  description: string | null
  status_id: string | null
  deadline: string | null
  created_by: string | null
  is_deleted: boolean
  is_pinned: boolean
  created_at: string
  updated_at: string
}

/**
 * Загрузить все треды проекта
 */
export function useProjectThreads(projectId: string | undefined) {
  return useQuery({
    queryKey: messengerKeys.projectThreads(projectId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_threads')
        .select('*')
        .eq('project_id', projectId!)
        .order('is_pinned', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (error) throw error
      return data as ProjectThread[]
    },
    enabled: !!projectId,
    staleTime: 60_000,
  })
}

/**
 * Получить threadId по legacy_channel из кэша project_threads
 */
export function useThreadIdByChannel(
  projectId: string | undefined,
  channel: MessageChannel = 'client',
): string | undefined {
  const { data: threads } = useProjectThreads(projectId)
  return threads?.find((c) => c.legacy_channel === channel)?.id
}

/**
 * Создать новый тред в проекте
 */
export function useCreateThread(projectId: string | null, workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      name: string
      accessType: 'all' | 'roles' | 'custom'
      accentColor?: ThreadAccentColor
      icon?: string
      type?: 'chat' | 'task'
      emailData?: { contactEmails: string[]; subject?: string }
      memberIds?: string[]
      accessRoles?: string[]
      // Task-specific
      deadline?: string | null
      statusId?: string | null
      assigneeIds?: string[]
      // Project override (если пользователь сменил проект в диалоге)
      projectIdOverride?: string | null
    }) => {
      const effectiveProjectId =
        params.projectIdOverride !== undefined ? params.projectIdOverride : projectId
      const { data, error } = await supabase
        .from('project_threads')
        .insert({
          ...(effectiveProjectId && { project_id: effectiveProjectId }),
          workspace_id: workspaceId,
          name: params.name,
          access_type: params.accessType,
          access_roles: params.accessType === 'roles' ? (params.accessRoles ?? []) : [],
          is_default: false,
          type: params.type ?? 'chat',
          ...(params.accentColor && { accent_color: params.accentColor }),
          ...(params.icon && { icon: params.icon }),
          ...(params.deadline !== undefined && { deadline: params.deadline }),
          ...(params.statusId !== undefined && { status_id: params.statusId }),
        })
        .select('*')
        .single()

      if (error) throw error
      const thread = data as ProjectThread

      // Create email links if email channel
      if (params.emailData && params.emailData.contactEmails.length > 0) {
        const rows = params.emailData.contactEmails.map((email) => ({
          thread_id: thread.id,
          contact_email: email,
          subject: params.emailData!.subject || null,
        }))
        const { error: linkError } = await supabase.from('project_thread_email_links').insert(rows)

        if (linkError) {
          // Rollback: delete the thread
          await supabase.from('project_threads').delete().eq('id', thread.id)
          throw linkError
        }
      }

      // Add members for custom access
      if (params.accessType === 'custom' && params.memberIds?.length) {
        const rows = params.memberIds.map((pid) => ({
          thread_id: thread.id,
          participant_id: pid,
        }))
        await supabase.from('project_thread_members').insert(rows)
      }

      // Add task assignees
      if (params.assigneeIds?.length) {
        await supabase
          .from('task_assignees')
          .insert(params.assigneeIds.map((pid) => ({ thread_id: thread.id, participant_id: pid })))
      }

      return thread
    },
    onSuccess: (_data, params) => {
      const effectivePid =
        params.projectIdOverride !== undefined ? params.projectIdOverride : projectId
      if (effectivePid) {
        queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads(effectivePid) })
      }
      if (projectId && projectId !== effectivePid) {
        queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads(projectId) })
      }
      queryClient.invalidateQueries({ queryKey: ['workspace-tasks', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['task-assignees-map'] })
      queryClient.invalidateQueries({ queryKey: ['my-urgent-tasks-count'] })
    },
  })
}

/**
 * Удалить тред (только не-дефолтный)
 */
export function useDeleteThread() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (thread: ProjectThread) => {
      if (thread.is_default) throw new Error('Нельзя удалить дефолтный тред')
      const { error } = await supabase.from('project_threads').delete().eq('id', thread.id)
      if (error) throw error
      return thread
    },
    onSuccess: (thread) => {
      queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads(thread.project_id) })
      queryClient.invalidateQueries({ queryKey: ['my-urgent-tasks-count'] })
    },
  })
}

/**
 * Переименовать тред
 */
export function useRenameThread() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { threadId: string; projectId: string; name: string }) => {
      const { error } = await supabase
        .from('project_threads')
        .update({ name: params.name })
        .eq('id', params.threadId)
      if (error) throw error
      return params
    },
    onSuccess: (params) => {
      queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads(params.projectId) })
    },
  })
}

/**
 * Закрепить/открепить тред в табах
 */
export function usePinThread() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { threadId: string; projectId: string; isPinned: boolean }) => {
      const { error } = await supabase
        .from('project_threads')
        .update({ is_pinned: params.isPinned })
        .eq('id', params.threadId)
      if (error) throw error
      return params
    },
    onSuccess: (params) => {
      queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads(params.projectId) })
    },
  })
}

/**
 * Обновить тред (name, accent_color, icon)
 */
export function useUpdateThread() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      threadId: string
      projectId: string
      name?: string
      accent_color?: ThreadAccentColor
      icon?: string
      type?: string
      project_id?: string | null
    }) => {
      const update: Record<string, unknown> = {}
      if (params.name !== undefined) update.name = params.name
      if (params.accent_color !== undefined) update.accent_color = params.accent_color
      if (params.icon !== undefined) update.icon = params.icon
      if (params.type !== undefined) update.type = params.type
      if (params.project_id !== undefined) update.project_id = params.project_id

      const { error } = await supabase
        .from('project_threads')
        .update(update)
        .eq('id', params.threadId)
      if (error) throw error
      return params
    },
    onSuccess: (params) => {
      queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads(params.projectId) })
      // Если проект сменился — инвалидируем и новый проект
      if (
        params.project_id !== undefined &&
        params.project_id &&
        params.project_id !== params.projectId
      ) {
        queryClient.invalidateQueries({
          queryKey: messengerKeys.projectThreads(params.project_id),
        })
      }
    },
  })
}
