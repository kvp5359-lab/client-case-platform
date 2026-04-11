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
      return data as EmailLink
    },
    onSuccess: () => {
      if (threadId) {
        queryClient.invalidateQueries({ queryKey: emailAccountKeys.emailLink(threadId) })
      }
    },
    onError: () => {
      toast.error('Не удалось привязать email')
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
