"use client"

/**
 * Мутации задач: обновление статуса, срока, имени, настроек.
 * invalidateKeys — список query keys для инвалидации (передаётся потребителем).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { taskKeys } from '@/hooks/queryKeys'

export function useUpdateTaskStatus(invalidateKeys: ReadonlyArray<readonly unknown[]>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ threadId, statusId }: { threadId: string; statusId: string | null }) => {
      const { error } = await supabase
        .from('project_threads')
        .update({ status_id: statusId })
        .eq('id', threadId)
      if (error) throw error
    },
    onSuccess: () => {
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key })
      queryClient.invalidateQueries({ queryKey: taskKeys.urgentCount })
    },
    onError: () => toast.error('Не удалось обновить статус'),
  })
}

export function useUpdateTaskDeadline(invalidateKeys: ReadonlyArray<readonly unknown[]>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ threadId, deadline }: { threadId: string; deadline: string | null }) => {
      const { error } = await supabase
        .from('project_threads')
        .update({ deadline })
        .eq('id', threadId)
      if (error) throw error
    },
    onSuccess: () => {
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key })
      queryClient.invalidateQueries({ queryKey: taskKeys.urgentCount })
    },
    onError: () => toast.error('Не удалось обновить срок'),
  })
}

export function useRenameTask(invalidateKeys: ReadonlyArray<readonly unknown[]>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ threadId, name }: { threadId: string; name: string }) => {
      const { error } = await supabase.from('project_threads').update({ name }).eq('id', threadId)
      if (error) throw error
    },
    onSuccess: () => {
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key })
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
      const { error } = await supabase
        .from('project_threads')
        .update({ name, accent_color, icon })
        .eq('id', threadId)
      if (error) throw error
    },
    onSuccess: () => {
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key })
    },
    onError: () => toast.error('Не удалось сохранить настройки'),
  })
}
