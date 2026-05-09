/**
 * Хуки для работы с email-настройками воркспейса:
 * — useWorkspaceEmailStatus: читает workspaces.email_* + workspace_email_settings
 * — useProvisionEmailDomain: дёргает Edge Function provision-email-domain
 *
 * Edge Function идемпотентна — вызывать можно как для активации,
 * так и для опроса/обновления статуса верификации.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { STALE_TIME } from '@/hooks/queryKeys'

export interface WorkspaceEmailStatus {
  workspace_id: string
  slug: string
  email_active: boolean
  email_resend_domain_id: string | null
  email_dkim_verified: boolean
  email_return_path_verified: boolean
  email_mx_verified: boolean
  email_activated_at: string | null
  inbox_address: string | null
  default_send_method: string | null
  notify_managers_on_unmatched: boolean
}

export const workspaceEmailKeys = {
  status: (workspaceId: string) => ['workspace-email-status', workspaceId] as const,
}

export function useWorkspaceEmailStatus(workspaceId: string | undefined) {
  return useQuery<WorkspaceEmailStatus | null>({
    queryKey: workspaceId ? workspaceEmailKeys.status(workspaceId) : ['workspace-email-status'],
    enabled: !!workspaceId,
    staleTime: STALE_TIME.STANDARD,
    queryFn: async () => {
      if (!workspaceId) return null
      const { data: ws, error: wsErr } = await supabase
        .from('workspaces')
        .select(
          'id, slug, email_active, email_resend_domain_id, email_dkim_verified, email_return_path_verified, email_mx_verified, email_activated_at',
        )
        .eq('id', workspaceId)
        .maybeSingle()
      if (wsErr) throw wsErr
      if (!ws) return null
      const { data: settings } = await supabase
        .from('workspace_email_settings')
        .select('inbox_address, default_send_method, notify_managers_on_unmatched')
        .eq('workspace_id', workspaceId)
        .maybeSingle()
      return {
        workspace_id: ws.id,
        slug: ws.slug ?? '',
        email_active: ws.email_active ?? false,
        email_resend_domain_id: ws.email_resend_domain_id ?? null,
        email_dkim_verified: ws.email_dkim_verified ?? false,
        email_return_path_verified: ws.email_return_path_verified ?? false,
        email_mx_verified: ws.email_mx_verified ?? false,
        email_activated_at: ws.email_activated_at ?? null,
        inbox_address: settings?.inbox_address ?? null,
        default_send_method: settings?.default_send_method ?? null,
        notify_managers_on_unmatched: settings?.notify_managers_on_unmatched ?? true,
      }
    },
  })
}

export function useProvisionEmailDomain(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error('workspace_id required')
      const { data, error } = await supabase.functions.invoke('provision-email-domain', {
        body: { workspace_id: workspaceId },
      })
      if (error) throw error
      return data as {
        ok: boolean
        domain: { id: string; name: string; overall_status: string }
        records: { record: string; name: string; type: string; status: string }[]
        workspace: {
          email_active: boolean
          dkim_verified: boolean
          spf_verified: boolean
          mx_verified: boolean
        }
      }
    },
    onSuccess: () => {
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: workspaceEmailKeys.status(workspaceId) })
      }
    },
  })
}
