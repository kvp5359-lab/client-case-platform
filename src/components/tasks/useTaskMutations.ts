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
    onError: () => toast.error('Не удалось переименовать задачу'),
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
