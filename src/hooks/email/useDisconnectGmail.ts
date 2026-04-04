"use client"

/**
 * Hook: useDisconnectGmail
 * Disconnects a Gmail account via gmail-disconnect Edge Function.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { emailAccountKeys } from '@/hooks/queryKeys'
import { toast } from 'sonner'

export function useDisconnectGmail() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await supabase.functions.invoke('gmail-disconnect', {
        body: { accountId },
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Gmail отключён')
      if (user) {
        queryClient.invalidateQueries({ queryKey: emailAccountKeys.byUser(user.id) })
      }
    },
    onError: () => {
      toast.error('Не удалось отключить Gmail')
    },
  })
}
