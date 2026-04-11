"use client"

/**
 * Hook: useEmailAccounts
 * Reads connected Gmail accounts for the current user.
 */

import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { emailAccountKeys, STALE_TIME } from '@/hooks/queryKeys'

export interface EmailAccount {
  id: string
  user_id: string
  workspace_id: string
  email: string
  is_active: boolean
  created_at: string
}

export function useEmailAccounts() {
  const { user } = useAuth()

  return useQuery({
    queryKey: emailAccountKeys.byUser(user?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_accounts')
        .select('id, user_id, workspace_id, email, is_active, created_at')
        .eq('user_id', user!.id)

      if (error) throw error
      return (data ?? []) as EmailAccount[]
    },
    enabled: !!user?.id,
    staleTime: STALE_TIME.LONG,
  })
}
