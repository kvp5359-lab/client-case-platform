"use client"

/**
 * Hook: useEmailAccounts
 * Reads connected Gmail accounts for the current user.
 */

import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { emailAccountKeys } from '@/hooks/queryKeys'

export interface EmailAccount {
  id: string
  user_id: string
  workspace_id: string
  email: string
  is_active: boolean
  watch_expires_at: string | null
  created_at: string
}

export function useEmailAccounts() {
  const { user } = useAuth()

  return useQuery({
    queryKey: emailAccountKeys.byUser(user?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_accounts')
        .select('id, user_id, workspace_id, email, is_active, watch_expires_at, created_at')
        .eq('user_id', user!.id)
        .eq('is_active', true)

      if (error) throw error
      return (data ?? []) as EmailAccount[]
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  })
}
