"use client"

import { User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'
import type { BotIntegration, DialogState } from './types'

type EmployeeBotsSectionProps = {
  employees: WorkspaceParticipant[]
  employeeBots: BotIntegration[]
  employeeBotByUserId: Map<string, BotIntegration>
  workspaceId: string
  onAction: (state: DialogState) => void
}

export function EmployeeBotsSection({
  employees,
  employeeBots,
  employeeBotByUserId,
  workspaceId,
  onAction,
}: EmployeeBotsSectionProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-cyan-50 dark:bg-cyan-950/30 flex items-center justify-center shrink-0">
            <User className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <CardTitle className="text-base">Личные боты сотрудников</CardTitle>
            <CardDescription className="mt-0.5">
              У каждого сотрудника может быть свой Telegram-бот с его именем и аватаркой. При
              отправке сообщений в группу клиент видит «Денис Крылов» с правильной аватаркой,
              а не общего бота-секретаря с приставкой имени в тексте.
            </CardDescription>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          {employeeBots.length} / {employees.length}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {employees.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            В воркспейсе нет сотрудников — список основан на участниках с командными ролями
            (Владелец, Администратор, Сотрудник, Внешний сотрудник).
          </p>
        ) : (
          employees.map((p) => {
            const bot = p.user_id ? employeeBotByUserId.get(p.user_id) : undefined
            const fullName = [p.name, p.last_name].filter(Boolean).join(' ') || p.email || '—'
            const botAvatarUrl = bot?.config.bot_avatar_url
            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-md border bg-card"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {bot ? (
                    botAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={botAvatarUrl}
                        alt=""
                        className="h-7 w-7 rounded-full shrink-0 object-cover bg-muted"
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-full shrink-0 bg-cyan-50 dark:bg-cyan-950/30 flex items-center justify-center">
                        <User className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                      </div>
                    )
                  ) : (
                    <div className="h-7 w-7 rounded-full shrink-0 bg-muted flex items-center justify-center">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                  <span className="font-medium text-sm truncate">{fullName}</span>
                  {bot ? (
                    <span className="text-xs text-muted-foreground font-mono truncate">
                      @{bot.config.bot_username}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground truncate">
                      Личный бот не подключён
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!p.user_id}
                  onClick={() =>
                    onAction({
                      title: `Личный бот: ${fullName}`,
                      bot: bot ?? null,
                      createParams: bot
                        ? null
                        : {
                            workspace_id: workspaceId,
                            type: 'telegram_employee_bot',
                            config: { owner_user_id: p.user_id! },
                          },
                    })
                  }
                >
                  {bot ? 'Изменить' : 'Подключить'}
                </Button>
              </div>
            )
          })
        )}
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
          (команды «/newbot», «/setname», «/setuserpic», «/setprivacy»→Enable). Готового бота
          нужно вручную добавить в нужные клиентские группы.
        </p>
      </CardContent>
    </Card>
  )
}
