/**
 * Превентивный баннер в шапке треда о проблемах с Telegram-привязкой.
 *
 * Сейчас показывает один кейс — «бот-секретарь не привязан в БД». Это
 * означает: группа подключена через `/link`, но в `project_telegram_chats.integration_id`
 * пусто. Чаще всего такое получается когда `/link` обрабатывал личный бот
 * сотрудника, а секретаря в группе нет (или ему сложно достучаться через
 * TG API в момент привязки).
 *
 * Виден только владельцу / менеджеру с правом `manage_workspace_settings`.
 * Клиентам в общем треде не показываем.
 *
 * Edge function умеет self-healing при следующей отправке (если секретарь
 * физически в группе — пропишет integration_id сам). Но если секретаря в
 * группе физически нет, self-heal провалится и сообщение станет failed.
 * Баннер заранее это предупреждает.
 */

import { AlertTriangle } from 'lucide-react'
import { useThreadTelegramHealth } from '@/hooks/messenger/useThreadTelegramHealth'
import { useWorkspacePermissions } from '@/hooks/permissions/useWorkspacePermissions'

type Props = {
  threadId: string
  workspaceId: string
}

export function ThreadHealthBanner({ threadId, workspaceId }: Props) {
  const { data: health } = useThreadTelegramHealth(threadId)
  const { isOwner, can } = useWorkspacePermissions({ workspaceId })

  if (!health?.missingSecretary) return null
  if (!isOwner && !can('manage_workspace_settings')) return null

  return (
    <div className="flex items-start gap-2 px-4 py-2 bg-amber-50/70 dark:bg-amber-950/30 border-b">
      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
          Бот-секретарь не привязан к этой группе
        </p>
        <p className="text-xs text-muted-foreground">
          Если личный бот сотрудника не справится с отправкой — сообщение не
          доставится. Добавьте бота-секретаря в Telegram-группу как админа, и
          сервис автоматически подтянет его при следующей отправке.
        </p>
      </div>
    </div>
  )
}
