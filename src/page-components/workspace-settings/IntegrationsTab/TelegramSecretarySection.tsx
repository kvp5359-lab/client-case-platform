"use client"

import { MessageCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { BotIntegration } from './types'

type TelegramSecretarySectionProps = {
  workspaceBots: BotIntegration[]
  telegramGroups: number
  onEdit: (bot: BotIntegration) => void
}

export function TelegramSecretarySection({
  workspaceBots,
  telegramGroups,
  onEdit,
}: TelegramSecretarySectionProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0">
            <MessageCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-base">Бот-секретарь</CardTitle>
            <CardDescription className="mt-0.5">
              Бот, добавляемый в групповые чаты с клиентами. Слушает входящие, обрабатывает
              команды клиента в группе.
            </CardDescription>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          Групп: {telegramGroups}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {workspaceBots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Бот не подключён.</p>
        ) : (
          workspaceBots.map((bot) => {
            const avatar = bot.config.bot_avatar_url
            return (
              <div
                key={bot.id}
                className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-md border bg-card"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatar}
                      alt=""
                      className="h-7 w-7 rounded-full shrink-0 object-cover bg-muted"
                    />
                  ) : (
                    <div className="h-7 w-7 rounded-full shrink-0 bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                      <MessageCircle className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    </div>
                  )}
                  <span className="font-medium text-sm truncate">
                    {bot.config.bot_display_name || 'Бот-секретарь'}
                  </span>
                  {bot.config.bot_username && (
                    <span className="text-xs text-muted-foreground font-mono truncate">
                      @{bot.config.bot_username}
                    </span>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => onEdit(bot)}>
                  {bot.has_token ? 'Изменить' : 'Указать токен'}
                </Button>
              </div>
            )
          })
        )}
        <p className="text-xs text-muted-foreground pt-1">
          Токен бота получается у{' '}
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            @BotFather
          </a>{' '}
          (команда «/newbot» или «/mybots → API Token» для существующего бота).
        </p>
      </CardContent>
    </Card>
  )
}
