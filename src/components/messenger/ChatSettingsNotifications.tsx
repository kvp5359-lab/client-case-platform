"use client"

/**
 * Секция «Уведомления» в настройках чата — личная подписка пользователя на тред.
 * Подписан = получаю непрочитанное/уведомления по треду. Отписан = доступ
 * остаётся (читать могу), но не цепляет. Это ЛИЧНАЯ настройка (не общая, в
 * отличие от «Кто видит чат»).
 */
import { Bell, BellOff } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useThreadSubscription } from '@/hooks/messenger/useThreadSubscription'

export function ChatSettingsNotifications({
  threadId,
  workspaceId,
}: {
  threadId: string
  workspaceId: string
}) {
  const { isSubscribed, setSubscribed, pending } = useThreadSubscription(threadId, workspaceId)
  const subscribed = isSubscribed === true
  const loading = isSubscribed === null

  return (
    <div className="space-y-1.5">
      <Label>Уведомления</Label>
      <button
        type="button"
        disabled={pending || loading}
        onClick={() => setSubscribed(!subscribed)}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 rounded-md border text-sm transition-colors',
          'hover:bg-muted/50 disabled:opacity-50 disabled:cursor-default',
          subscribed ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {subscribed ? (
          <Bell className="h-4 w-4 shrink-0" />
        ) : (
          <BellOff className="h-4 w-4 shrink-0" />
        )}
        <span className="truncate">
          {loading
            ? 'Загрузка…'
            : subscribed
              ? 'Вы подписаны на уведомления'
              : 'Вы не подписаны'}
        </span>
        {!loading && (
          <span className="ml-auto text-xs text-muted-foreground shrink-0">
            {subscribed ? 'Отписаться' : 'Подписаться'}
          </span>
        )}
      </button>
      <p className="text-xs text-muted-foreground">
        Личная настройка: вы получаете непрочитанное и уведомления по этому треду. Доступ
        к чату это не меняет.
      </p>
    </div>
  )
}
