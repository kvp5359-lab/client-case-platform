"use client"

import { useMemo } from 'react'
import { Mail } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'
import type { EmailAccount } from './types'

export function GmailSection({
  emailAccounts,
  participants,
}: {
  emailAccounts: EmailAccount[]
  participants: WorkspaceParticipant[]
}) {
  const participantByUserId = useMemo(() => {
    const map = new Map<string, WorkspaceParticipant>()
    participants.forEach((p) => {
      if (p.user_id) map.set(p.user_id, p)
    })
    return map
  }, [participants])

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center shrink-0">
            <Mail className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <CardTitle className="text-base">Gmail</CardTitle>
            <CardDescription className="mt-0.5">
              Подключённые ящики сотрудников. Подключение — через карточку проекта в разделе
              «Почта».
            </CardDescription>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          {emailAccounts.length > 0 ? `${emailAccounts.length} ящик(ов)` : 'Нет ящиков'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {emailAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ящики пока не подключены.</p>
        ) : (
          emailAccounts.map((acc) => {
            const owner = acc.user_id ? participantByUserId.get(acc.user_id) : undefined
            const ownerName = owner
              ? [owner.name, owner.last_name].filter(Boolean).join(' ') || owner.email
              : null
            const watchExpired =
              acc.watch_expires_at && new Date(acc.watch_expires_at) < new Date()
            return (
              <div
                key={acc.id}
                className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-md border bg-card"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {owner?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={owner.avatar_url}
                      alt=""
                      className="h-7 w-7 rounded-full shrink-0 object-cover bg-muted"
                    />
                  ) : (
                    <div className="h-7 w-7 rounded-full shrink-0 bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                      <Mail className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    </div>
                  )}
                  <span className="font-medium text-sm truncate">
                    {ownerName ?? '—'}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono truncate">
                    {acc.email}
                  </span>
                  {!acc.is_active && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                      выкл
                    </Badge>
                  )}
                  {watchExpired && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">
                      watch истёк
                    </Badge>
                  )}
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
