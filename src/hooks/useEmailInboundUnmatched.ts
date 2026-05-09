import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { emailInboundKeys, STALE_TIME } from '@/hooks/queryKeys'

export type UnmatchedEmail = {
  id: string
  workspace_id: string | null
  from_address: string
  from_name: string | null
  to_addresses: string[]
  cc_addresses: string[] | null
  subject: string | null
  message_id_header: string | null
  in_reply_to: string | null
  original_to: string | null
  received_at: string
  reason: string
  resolved_at: string | null
  resolved_by: string | null
  resolved_thread_id: string | null
  spam_score: number | null
}

export function useUnmatchedEmails(workspaceId: string | undefined) {
  return useQuery<UnmatchedEmail[]>({
    queryKey: workspaceId
      ? emailInboundKeys.byWorkspace(workspaceId)
      : emailInboundKeys.all,
    enabled: !!workspaceId,
    staleTime: STALE_TIME.SHORT,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_inbound_unmatched')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('received_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as UnmatchedEmail[]
    },
  })
}
