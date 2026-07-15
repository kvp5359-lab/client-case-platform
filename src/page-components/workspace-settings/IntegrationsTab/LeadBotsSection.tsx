"use client"

import { Megaphone, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useGlobalThreadTemplates } from '@/hooks/messenger/useThreadTemplates'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'
import { LeadBotRow } from './LeadBotRow'
import type { BotIntegration, DialogState } from './types'

type LeadBotsSectionProps = {
  workspaceId: string
  leadBots: BotIntegration[]
  employees: WorkspaceParticipant[]
  onAction: (state: DialogState) => void
  onSaved: () => void
}

export function LeadBotsSection({
  workspaceId,
  leadBots,
  employees,
  onAction,
  onSaved,
}: LeadBotsSectionProps) {
  // Шаблоны диалога (иконка/цвет/статус/дедлайн/исполнители нового чата).
  // Библиотека воркспейса; email-шаблоны отсекаем — лид-диалог идёт в Telegram.
  const { data: allTemplates = [] } = useGlobalThreadTemplates(workspaceId)
  const templates = allTemplates.filter((t) => !t.is_email)

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center shrink-0">
            <Megaphone className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-base">Лид-боты (реклама)</CardTitle>
            <CardDescription className="mt-0.5">
              Отдельный бот, которого можно рекламировать. Клиент пишет ему в личку по ссылке
              из рекламы — в CRM автоматически появляется диалог с меткой кампании. Дальше
              переписку ведёт назначенная команда прямо из системы. Ботов можно завести
              несколько — например, под каждое направление или объявление.
            </CardDescription>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          {leadBots.length}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {leadBots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Пока нет ни одного лид-бота. Создайте бота в @BotFather и добавьте его токен.
          </p>
        ) : (
          leadBots.map((bot) => (
            <LeadBotRow
              key={bot.id}
              bot={bot}
              employees={employees}
              templates={templates}
              workspaceId={workspaceId}
              onAction={onAction}
              onSaved={onSaved}
            />
          ))
        )}

        <Button
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={() =>
            onAction({
              title: 'Новый лид-бот',
              bot: null,
              createParams: {
                workspace_id: workspaceId,
                type: 'telegram_lead_bot',
                config: {},
              },
            })
          }
        >
          <Plus className="h-4 w-4 mr-1" />
          Добавить лид-бота
        </Button>

        <p className="text-xs text-muted-foreground pt-1">
          Бот создаётся в{' '}
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            @BotFather
          </a>{' '}
          (команды «/newbot», «/setname», «/setuserpic»). Рекламная ссылка с меткой:{' '}
          <code className="text-[11px]">t.me/ваш_бот?start=промо1</code>.
        </p>
      </CardContent>
    </Card>
  )
}
