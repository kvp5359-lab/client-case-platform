"use client"

/**
 * EmailSendMethodSelector — компактный селектор «От кого» в шапке композера
 * email-тредов. Сохраняет выбор в `project_threads.email_send_method` +
 * `email_send_account_id`, влияя на все следующие исходящие в этом треде.
 *
 * Опции:
 *   - "Через сервис (t+<id>@<slug>.cc.app)" — system_postmark, через Resend
 *   - "Через мой Gmail (<email>)" — employee_mailbox, через подключённый OAuth
 *
 * Показывается только когда:
 *   1) тред — email-канал (project_threads.type='email' либо есть сообщения
 *      с source IN ('email','email_internal'))
 *   2) у пользователя есть хотя бы один подключённый ящик (иначе и так Resend)
 */

import { useMemo } from 'react'
import { Mail, Loader2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useEmailAccounts } from '@/hooks/email/useEmailAccounts'
import { messengerKeys, threadEmailSettingsKeys } from '@/hooks/queryKeys'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Props = {
  threadId: string
}

type ThreadEmailContext = {
  type: string | null
  short_id: number | null
  email_send_method: string | null
  email_send_account_id: string | null
  workspace_slug: string | null
  has_email_history: boolean
}

export function EmailSendMethodSelector({ threadId }: Props) {
  const queryClient = useQueryClient()
  const { data: accounts = [] } = useEmailAccounts()
  const activeAccounts = useMemo(() => accounts.filter((a) => a.is_active), [accounts])

  const { data: ctx } = useQuery<ThreadEmailContext | null>({
    queryKey: threadEmailSettingsKeys.byThread(threadId),
    enabled: !!threadId,
    queryFn: async () => {
      const { data: thread, error } = await supabase
        .from('project_threads')
        .select(
          'type, short_id, email_send_method, email_send_account_id, workspaces(slug)',
        )
        .eq('id', threadId)
        .maybeSingle()
      if (error) throw error
      if (!thread) return null

      // Если type ещё 'chat' — проверяем historic email_internal/email
      const { count } = await supabase
        .from('project_messages')
        .select('id', { count: 'exact', head: true })
        .eq('thread_id', threadId)
        .in('source', ['email', 'email_internal'])
      return {
        type: (thread as { type: string | null }).type ?? null,
        short_id: (thread as { short_id: number | null }).short_id ?? null,
        email_send_method:
          (thread as { email_send_method: string | null }).email_send_method ?? null,
        email_send_account_id:
          (thread as { email_send_account_id: string | null }).email_send_account_id ?? null,
        workspace_slug:
          ((thread as { workspaces: { slug: string | null } | null }).workspaces?.slug) ?? null,
        has_email_history: (count ?? 0) > 0,
      }
    },
  })

  const update = useMutation({
    mutationFn: async (params: {
      method: 'system_postmark' | 'employee_mailbox' | 'auto'
      accountId: string | null
    }) => {
      const { error } = await supabase
        .from('project_threads')
        .update({
          email_send_method: params.method,
          email_send_account_id: params.accountId,
        })
        .eq('id', threadId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: threadEmailSettingsKeys.byThread(threadId) })
      queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads('') })
    },
  })

  if (!ctx) return null
  const isEmailThread = ctx.type === 'email' || ctx.has_email_history
  if (!isEmailThread) return null
  if (activeAccounts.length === 0) return null

  const currentMethod = ctx.email_send_method ?? 'auto'
  const currentAccountId = ctx.email_send_account_id ?? null

  const value =
    currentMethod === 'employee_mailbox' && currentAccountId
      ? `acc:${currentAccountId}`
      : currentMethod === 'system_postmark'
        ? 'system'
        : currentAccountId
          ? `acc:${currentAccountId}`
          : 'system'

  const onChange = (v: string) => {
    if (v === 'system') {
      update.mutate({ method: 'system_postmark', accountId: null })
      return
    }
    if (v.startsWith('acc:')) {
      const accId = v.slice(4)
      update.mutate({ method: 'employee_mailbox', accountId: accId })
    }
  }

  const systemAddress =
    ctx.short_id != null && ctx.workspace_slug
      ? `t+${ctx.short_id}@${ctx.workspace_slug}.clientcase.app`
      : 'системный адрес'

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 text-xs">
      <Mail className="h-3.5 w-3.5 text-rose-500 shrink-0" />
      <span className="text-muted-foreground shrink-0">Отправлять от:</span>
      <Select value={value} onValueChange={onChange} disabled={update.isPending}>
        <SelectTrigger className="h-7 text-xs w-auto min-w-[200px] gap-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="system">
            <span className="font-mono">{systemAddress}</span>
            <span className="text-muted-foreground ml-2">(сервис)</span>
          </SelectItem>
          {activeAccounts.map((a) => (
            <SelectItem key={a.id} value={`acc:${a.id}`}>
              <span className="font-mono">{a.email}</span>
              <span className="text-muted-foreground ml-2">(мой Gmail)</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {update.isPending && (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      )}
    </div>
  )
}
