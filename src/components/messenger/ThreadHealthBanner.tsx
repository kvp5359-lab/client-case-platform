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

import { useMemo, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useThreadTelegramHealth } from '@/hooks/messenger/useThreadTelegramHealth'
import { useWorkspacePermissions } from '@/hooks/permissions/useWorkspacePermissions'

type Props = {
  threadId: string
  workspaceId: string
}

const dismissKey = (threadId: string) => `cc_health_banner_dismissed:${threadId}`

export function ThreadHealthBanner({ threadId, workspaceId }: Props) {
  const { data: health } = useThreadTelegramHealth(threadId)
  const { isOwner, can } = useWorkspacePermissions({ workspaceId })

  // Закрытие баннера запоминается per-thread (localStorage) — чтобы не
  // мозолил при каждом открытии треда. Если проблема реально исчезнет,
  // health.missingSecretary станет false и баннер не покажется в любом случае.
  // bump перечитывает localStorage после закрытия без setState-в-эффекте.
  const [bump, setBump] = useState(0)
  const dismissed = useMemo(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(dismissKey(threadId)) === '1'
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bump форсит перечитку
  }, [threadId, bump])

  if (!health?.missingSecretary) return null
  if (!isOwner && !can('manage_workspace_settings')) return null
  if (dismissed) return null

  const handleDismiss = () => {
    if (typeof window !== 'undefined') localStorage.setItem(dismissKey(threadId), '1')
    setBump((v) => v + 1)
  }

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
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 -mr-1 -mt-0.5 p-1 rounded text-amber-600/60 hover:text-amber-700 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 transition-colors"
        aria-label="Скрыть предупреждение"
        title="Скрыть"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
