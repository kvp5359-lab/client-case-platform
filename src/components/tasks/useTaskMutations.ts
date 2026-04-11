"use client"

/**
 * Мутации задач: обновление статуса, срока, имени, настроек.
 * invalidateKeys — список query keys для инвалидации (передаётся потребителем).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { logAuditAction } from '@/services/auditService'

export function useUpdateTaskStatus(invalidateKeys: ReadonlyArray<readonly unknown[]>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ threadId, statusId }: { threadId: string; statusId: string | null }) => {
      // Read old value for audit
      const { data: old } = await supabase
        .from('project_threads')
        .select('status_id, name, project_id')
        .eq('id', threadId)
        .single()

      const { error } = await supabase
        .from('project_threads')
        .update({ status_id: statusId })
        .eq('id', threadId)
      if (error) throw error

      await logAuditAction('change_status', 'task', threadId, {
        name: old?.name,
        old_status: old?.status_id,
        new_status: statusId,
      }, old?.project_id ?? undefined)
    },
    onSuccess: (_, { threadId }) => {
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key })
      queryClient.invalidateQueries({ queryKey: ['thread-audit-events', threadId] })
    },
    onError: () => toast.error('Не удалось обновить статус'),
  })
}

export function useUpdateTaskDeadline(invalidateKeys: ReadonlyArray<readonly unknown[]>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ threadId, deadline }: { threadId: string; deadline: string | null }) => {
      const { data: old } = await supabase
        .from('project_threads')
        .select('deadline, name, project_id')
        .eq('id', threadId)
        .single()

      const { error } = await supabase
        .from('project_threads')
        .update({ deadline })
        .eq('id', threadId)
      if (error) throw error

      await logAuditAction('change_deadline', 'task', threadId, {
        name: old?.name,
        old_deadline: old?.deadline,
        new_deadline: deadline,
      }, old?.project_id ?? undefined)
    },
    onSuccess: (_, { threadId }) => {
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key })
      queryClient.invalidateQueries({ queryKey: ['thread-audit-events', threadId] })
    },
    onError: () => toast.error('Не удалось обновить срок'),
  })
}

export function useRenameTask(invalidateKeys: ReadonlyArray<readonly unknown[]>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ threadId, name }: { threadId: string; name: string }) => {
      const { data: old } = await supabase
        .from('project_threads')
        .select('name, project_id')
        .eq('id', threadId)
        .single()

      const { error } = await supabase.from('project_threads').update({ name }).eq('id', threadId)
      if (error) throw error

      await logAuditAction('rename', 'task', threadId, {
        old_name: old?.name,
        new_name: name,
      }, old?.project_id ?? undefined)
    },
    onSuccess: (_, { threadId }) => {
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key })
      queryClient.invalidateQueries({ queryKey: ['thread-audit-events', threadId] })
    },
    onError: () => toast.error('Не удалось переименовать'),
  })
}

export function useReorderTasks(invalidateKeys: ReadonlyArray<readonly unknown[]>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      const promises = updates.map(({ id, sort_order }) =>
        supabase.from('project_threads').update({ sort_order }).eq('id', id),
      )
      const results = await Promise.all(promises)
      const error = results.find((r) => r.error)?.error
      if (error) throw error
    },
    onMutate: async (updates) => {
      // Optimistic update: сразу обновляем sort_order в кэше
      const orderMap = new Map(updates.map((u) => [u.id, u.sort_order]))

      for (const key of invalidateKeys) {
        await queryClient.cancelQueries({ queryKey: key })
        queryClient.setQueryData(key, (old: unknown) => {
          if (!Array.isArray(old)) return old
          return old.map((item: { id: string; sort_order?: number }) =>
            orderMap.has(item.id)
              ? { ...item, sort_order: orderMap.get(item.id) }
              : item,
          )
        })
      }
    },
    onError: () => {
      // При ошибке — рефетч актуальных данных
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key })
      toast.error('Не удалось сохранить порядок')
    },
  })
}

export function useUpdateTaskSettings(invalidateKeys: ReadonlyArray<readonly unknown[]>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      threadId,
      name,
      accent_color,
      icon,
    }: {
      threadId: string
      name: string
      accent_color: string
      icon: string
    }) => {
      const { data: old } = await supabase
        .from('project_threads')
        .select('name, accent_color, icon, project_id')
        .eq('id', threadId)
        .single()

      const { error } = await supabase
        .from('project_threads')
        .update({ name, accent_color, icon })
        .eq('id', threadId)
      if (error) throw error

      await logAuditAction('change_settings', 'task', threadId, {
        old_name: old?.name,
        new_name: name,
        old_accent_color: old?.accent_color,
        new_accent_color: accent_color,
        old_icon: old?.icon,
        new_icon: icon,
      }, old?.project_id ?? undefined)
    },
    onSuccess: (_, { threadId }) => {
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key })
      queryClient.invalidateQueries({ queryKey: ['thread-audit-events', threadId] })
    },
    onError: () => toast.error('Не удалось сохранить настройки'),
  })
}
