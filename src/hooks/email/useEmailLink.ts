"use client"

/**
 * Hook: useEmailLink
 * Checks whether a thread has an email link (project_thread_email_links).
 * Returns the link data + mutations to create/remove links.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { emailAccountKeys, STALE_TIME } from '@/hooks/queryKeys'

export interface EmailLink {
  id: string
  thread_id: string
  contact_email: string
  subject: string | null
  gmail_thread_id: string | null
  is_active: boolean
  created_at: string
}

export function useEmailLink(threadId: string | undefined) {
  return useQuery({
    queryKey: emailAccountKeys.emailLink(threadId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_thread_email_links')
        .select('id, thread_id, contact_email, subject, gmail_thread_id, is_active, created_at')
        .eq('thread_id', threadId!)
        .eq('is_active', true)
        .maybeSingle()

      if (error) throw error
      return data as EmailLink | null
    },
    enabled: !!threadId,
    staleTime: STALE_TIME.STANDARD,
  })
}

export function useCreateEmailLink(threadId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { contactEmail: string; subject?: string }) => {
      if (!threadId) throw new Error('threadId is required')

      const { data, error } = await supabase
        .from('project_thread_email_links')
        .insert({
          thread_id: threadId,
          contact_email: params.contactEmail,
          subject: params.subject || null,
        })
        .select('*')
        .single()

      if (error) throw error

      // Привязка email-канала к треду — автоматически переключаем тип треда
      // на 'email' (если был 'chat'). Это синхронизирует UI-сегмент и логику
      // отображения. Также backfill'им email_subject_root если задан subject
      // и в треде ещё пусто — чтобы первое исходящее уходило с правильной темой.
      const threadUpdates: Record<string, unknown> = { type: 'email' }
      if (params.subject) {
        const { data: t } = await supabase
          .from('project_threads')
          .select('email_subject_root')
          .eq('id', threadId)
          .maybeSingle()
        const current = (t as { email_subject_root?: string | null } | null)?.email_subject_root
        if (!current || !current.trim()) {
          threadUpdates.email_subject_root = params.subject
        }
      }
      await supabase.from('project_threads').update(threadUpdates).eq('id', threadId)

      return data as EmailLink
    },
    onSuccess: () => {
      if (threadId) {
        queryClient.invalidateQueries({ queryKey: emailAccountKeys.emailLink(threadId) })
        // Тред мог сменить type → инвалидируем кеш тредов
        queryClient.invalidateQueries({ queryKey: ['threads'] })
        queryClient.invalidateQueries({ queryKey: ['thread', threadId] })
      }
    },
    onError: () => {
      toast.error('Не удалось привязать email')
    },
  })
}

/**
 * UPDATE существующей привязки — для редактирования email клиента / темы
 * без отвязки-привязки заново. Используется когда тред уже подключён к email.
 */
export function useUpdateEmailLink(threadId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { linkId: string; contactEmail: string; subject?: string | null }) => {
      const { data, error } = await supabase
        .from('project_thread_email_links')
        .update({
          contact_email: params.contactEmail,
          subject: params.subject || null,
        })
        .eq('id', params.linkId)
        .select('*')
        .single()
      if (error) throw error

      // Если меняли тему — синкаем email_subject_root треда тоже,
      // чтобы следующее исходящее ушло с новой темой.
      if (threadId && params.subject) {
        await supabase
          .from('project_threads')
          .update({ email_subject_root: params.subject })
          .eq('id', threadId)
      }

      return data as EmailLink
    },
    onSuccess: () => {
      if (threadId) {
        queryClient.invalidateQueries({ queryKey: emailAccountKeys.emailLink(threadId) })
        queryClient.invalidateQueries({ queryKey: ['thread', threadId] })
      }
    },
    onError: () => {
      toast.error('Не удалось обновить email-канал')
    },
  })
}

export function useRemoveEmailLink(threadId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from('project_thread_email_links')
        .update({ is_active: false })
        .eq('id', linkId)

      if (error) throw error
    },
    onSuccess: () => {
      if (threadId) {
        queryClient.invalidateQueries({ queryKey: emailAccountKeys.emailLink(threadId) })
      }
    },
    onError: () => {
      toast.error('Не удалось отвязать email')
    },
  })
}
